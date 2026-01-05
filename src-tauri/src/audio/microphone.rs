//! 麦克风采集模块
//!
//! 使用 cpal 实现跨平台麦克风采集

use super::capture::AudioCapture;
use super::format::{convert_channels, i16_to_f32};
use super::types::{
    create_audio_stream, AudioCaptureConfig, AudioChunk, AudioError, AudioResult, AudioSource,
    AudioSourceType, AudioStream, AudioStreamSender, CaptureState, CaptureStats,
};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, SampleFormat, Stream, StreamConfig};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, RwLock};
use std::time::Instant;

// ============================================================================
// 麦克风设备列表
// ============================================================================

/// 列出所有可用的麦克风设备
pub fn list_microphones() -> AudioResult<Vec<AudioSource>> {
    let host = cpal::default_host();
    let mut sources = Vec::new();

    // 获取默认输入设备
    let default_device = host.default_input_device();
    let default_name = default_device
        .as_ref()
        .and_then(|d| d.name().ok())
        .unwrap_or_default();

    // 枚举所有输入设备
    let devices = host
        .input_devices()
        .map_err(|e| AudioError::DeviceNotFound(format!("枚举音频设备失败: {}", e)))?;

    for device in devices {
        let name = device.name().unwrap_or_else(|_| "未知设备".to_string());
        let id = name.clone();
        let is_default = name == default_name;

        // 获取设备支持的配置
        let (sample_rate, channels) = if let Ok(config) = device.default_input_config() {
            (Some(config.sample_rate().0), Some(config.channels()))
        } else {
            (None, None)
        };

        sources.push(AudioSource {
            id,
            name,
            source_type: AudioSourceType::Microphone,
            is_default,
            sample_rate,
            channels,
        });
    }

    Ok(sources)
}

/// 获取默认麦克风设备
pub fn get_default_microphone() -> AudioResult<AudioSource> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| AudioError::DeviceNotFound("没有找到默认麦克风设备".to_string()))?;

    let name = device.name().unwrap_or_else(|_| "默认麦克风".to_string());
    let id = name.clone();

    let (sample_rate, channels) = if let Ok(config) = device.default_input_config() {
        (Some(config.sample_rate().0), Some(config.channels()))
    } else {
        (None, None)
    };

    Ok(AudioSource {
        id,
        name,
        source_type: AudioSourceType::Microphone,
        is_default: true,
        sample_rate,
        channels,
    })
}

// ============================================================================
// 麦克风采集实现
// ============================================================================

/// 麦克风采集器
pub struct MicrophoneCapture {
    /// 当前状态
    state: CaptureState,
    /// cpal 音频流
    stream: Option<Stream>,
    /// 采集统计
    stats: Arc<RwLock<CaptureStats>>,
    /// 运行标志
    running: Arc<AtomicBool>,
    /// 暂停标志
    paused: Arc<AtomicBool>,
    /// 当前设备
    current_device: Option<Device>,
}

impl MicrophoneCapture {
    /// 创建新的麦克风采集器
    pub fn new() -> Self {
        Self {
            state: CaptureState::Idle,
            stream: None,
            stats: Arc::new(RwLock::new(CaptureStats::default())),
            running: Arc::new(AtomicBool::new(false)),
            paused: Arc::new(AtomicBool::new(false)),
            current_device: None,
        }
    }

    /// 根据 ID 获取设备
    fn get_device_by_id(&self, device_id: &str) -> AudioResult<Device> {
        let host = cpal::default_host();

        // 如果 ID 为空或 "default"，返回默认设备
        if device_id.is_empty() || device_id == "default" {
            return host
                .default_input_device()
                .ok_or_else(|| AudioError::DeviceNotFound("没有找到默认麦克风设备".to_string()));
        }

        // 查找指定 ID 的设备
        let devices = host
            .input_devices()
            .map_err(|e| AudioError::DeviceNotFound(format!("枚举设备失败: {}", e)))?;

        for device in devices {
            if let Ok(name) = device.name() {
                if name == device_id {
                    return Ok(device);
                }
            }
        }

        Err(AudioError::DeviceNotFound(format!(
            "未找到设备: {}",
            device_id
        )))
    }

    /// 创建音频流
    fn create_stream(
        &self,
        device: &Device,
        config: &AudioCaptureConfig,
        sender: AudioStreamSender,
        running: Arc<AtomicBool>,
        paused: Arc<AtomicBool>,
        stats: Arc<RwLock<CaptureStats>>,
    ) -> AudioResult<Stream> {
        let supported_config = device
            .default_input_config()
            .map_err(|e| AudioError::ConfigError(format!("获取设备配置失败: {}", e)))?;

        let sample_format = supported_config.sample_format();
        let stream_config: StreamConfig = supported_config.into();

        let src_channels = stream_config.channels;
        let src_sample_rate = stream_config.sample_rate.0;
        let dst_channels = config.channels;
        let _start_time = Instant::now();

        // 用于追踪时间戳
        let sample_counter = Arc::new(AtomicU64::new(0));

        let err_fn = |err| {
            tracing::error!("音频流错误: {}", err);
        };

        // 根据采样格式创建流
        let stream = match sample_format {
            SampleFormat::F32 => {
                let sample_counter = sample_counter.clone();
                device
                    .build_input_stream(
                        &stream_config,
                        move |data: &[f32], _: &cpal::InputCallbackInfo| {
                            if !running.load(Ordering::Relaxed) || paused.load(Ordering::Relaxed) {
                                return;
                            }

                            // 转换通道数
                            let samples = if src_channels != dst_channels {
                                convert_channels(data, src_channels, dst_channels)
                            } else {
                                data.to_vec()
                            };

                            // 计算时间戳
                            let samples_processed =
                                sample_counter.fetch_add(data.len() as u64, Ordering::Relaxed);
                            let timestamp_ms = (samples_processed as f64
                                / src_sample_rate as f64
                                / src_channels as f64
                                * 1000.0) as u64;

                            let chunk =
                                AudioChunk::new(samples, timestamp_ms, src_sample_rate, dst_channels);

                            // 更新统计
                            if let Ok(mut s) = stats.write() {
                                s.total_samples += data.len() as u64;
                                s.total_frames += (data.len() / src_channels as usize) as u64;
                            }

                            // 发送数据
                            if sender.blocking_send(chunk).is_err() {
                                tracing::debug!("音频通道已关闭");
                            }
                        },
                        err_fn,
                        None,
                    )
                    .map_err(|e| AudioError::StreamError(format!("创建音频流失败: {}", e)))?
            }
            SampleFormat::I16 => {
                let sample_counter = sample_counter.clone();
                device
                    .build_input_stream(
                        &stream_config,
                        move |data: &[i16], _: &cpal::InputCallbackInfo| {
                            if !running.load(Ordering::Relaxed) || paused.load(Ordering::Relaxed) {
                                return;
                            }

                            // 转换为 f32
                            let f32_data = i16_to_f32(data);

                            // 转换通道数
                            let samples = if src_channels != dst_channels {
                                convert_channels(&f32_data, src_channels, dst_channels)
                            } else {
                                f32_data
                            };

                            // 计算时间戳
                            let samples_processed =
                                sample_counter.fetch_add(data.len() as u64, Ordering::Relaxed);
                            let timestamp_ms = (samples_processed as f64
                                / src_sample_rate as f64
                                / src_channels as f64
                                * 1000.0) as u64;

                            let chunk =
                                AudioChunk::new(samples, timestamp_ms, src_sample_rate, dst_channels);

                            // 更新统计
                            if let Ok(mut s) = stats.write() {
                                s.total_samples += data.len() as u64;
                                s.total_frames += (data.len() / src_channels as usize) as u64;
                            }

                            // 发送数据
                            if sender.blocking_send(chunk).is_err() {
                                tracing::debug!("音频通道已关闭");
                            }
                        },
                        err_fn,
                        None,
                    )
                    .map_err(|e| AudioError::StreamError(format!("创建音频流失败: {}", e)))?
            }
            _ => {
                return Err(AudioError::ConfigError(format!(
                    "不支持的采样格式: {:?}",
                    sample_format
                )));
            }
        };

        Ok(stream)
    }
}

impl Default for MicrophoneCapture {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioCapture for MicrophoneCapture {
    fn list_sources(&self) -> AudioResult<Vec<AudioSource>> {
        list_microphones()
    }

    fn start(
        &mut self,
        source: &AudioSource,
        config: &AudioCaptureConfig,
    ) -> AudioResult<AudioStream> {
        // 检查是否已在采集
        if self.state == CaptureState::Running {
            return Err(AudioError::Other("采集已在运行中".to_string()));
        }

        // 验证音频源类型
        if !matches!(source.source_type, AudioSourceType::Microphone) {
            return Err(AudioError::ConfigError(
                "MicrophoneCapture 只支持麦克风音频源".to_string(),
            ));
        }

        tracing::info!("开始麦克风采集: {}", source.name);

        // 获取设备
        let device = self.get_device_by_id(&source.id)?;

        // 创建音频流通道
        let (sender, receiver) = create_audio_stream(config.buffer_size as usize);

        // 设置运行标志
        self.running.store(true, Ordering::Relaxed);
        self.paused.store(false, Ordering::Relaxed);

        // 重置统计
        if let Ok(mut stats) = self.stats.write() {
            *stats = CaptureStats {
                start_time: Some(Instant::now()),
                ..Default::default()
            };
        }

        // 创建音频流
        let stream = self.create_stream(
            &device,
            config,
            sender,
            self.running.clone(),
            self.paused.clone(),
            self.stats.clone(),
        )?;

        // 启动流
        stream
            .play()
            .map_err(|e| AudioError::StreamError(format!("启动音频流失败: {}", e)))?;

        self.stream = Some(stream);
        self.current_device = Some(device);
        self.state = CaptureState::Running;

        Ok(receiver)
    }

    fn stop(&mut self) -> AudioResult<()> {
        tracing::info!("停止麦克风采集");

        self.running.store(false, Ordering::Relaxed);

        if let Some(stream) = self.stream.take() {
            drop(stream);
        }

        self.current_device = None;
        self.state = CaptureState::Stopped;

        Ok(())
    }

    fn pause(&mut self) -> AudioResult<()> {
        if self.state != CaptureState::Running {
            return Err(AudioError::Other("采集未在运行".to_string()));
        }

        tracing::info!("暂停麦克风采集");

        self.paused.store(true, Ordering::Relaxed);

        if let Some(ref stream) = self.stream {
            let _ = stream.pause();
        }

        self.state = CaptureState::Paused;
        Ok(())
    }

    fn resume(&mut self) -> AudioResult<()> {
        if self.state != CaptureState::Paused {
            return Err(AudioError::Other("采集未暂停".to_string()));
        }

        tracing::info!("恢复麦克风采集");

        self.paused.store(false, Ordering::Relaxed);

        if let Some(ref stream) = self.stream {
            stream
                .play()
                .map_err(|e| AudioError::StreamError(format!("恢复音频流失败: {}", e)))?;
        }

        self.state = CaptureState::Running;
        Ok(())
    }

    fn state(&self) -> CaptureState {
        self.state
    }

    fn stats(&self) -> CaptureStats {
        self.stats.read().map(|s| s.clone()).unwrap_or_default()
    }
}

impl Drop for MicrophoneCapture {
    fn drop(&mut self) {
        if self.state == CaptureState::Running {
            let _ = self.stop();
        }
    }
}

