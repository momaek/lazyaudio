//! macOS 系统音频采集实现
//!
//! 使用 AudioCapCLI 实现系统音频采集

use super::audiocap_cli::AudioCapProcess;
use super::capture::AudioCapture;
use super::types::{
    create_audio_stream, AudioCaptureConfig, AudioResult, AudioSource, AudioSourceType,
    AudioStream, CaptureState, CaptureStats,
};
use std::sync::{Arc, RwLock};
use std::time::Instant;

/// macOS 系统音频采集
///
/// 通过 AudioCapCLI 进程采集系统音频或指定应用音频
pub struct MacOSSystemCapture {
    /// Tauri 应用句柄
    app_handle: Option<tauri::AppHandle>,
    /// 当前采集进程
    process: Option<AudioCapProcess>,
    /// 采集状态
    state: CaptureState,
    /// 采集统计
    stats: Arc<RwLock<CaptureStats>>,
}

impl MacOSSystemCapture {
    /// 创建新的 macOS 系统音频采集实例
    pub fn new(app_handle: Option<tauri::AppHandle>) -> Self {
        Self {
            app_handle,
            process: None,
            state: CaptureState::Idle,
            stats: Arc::new(RwLock::new(CaptureStats::default())),
        }
    }

    /// 设置 Tauri 应用句柄
    pub fn set_app_handle(&mut self, handle: tauri::AppHandle) {
        self.app_handle = Some(handle);
    }
}

impl AudioCapture for MacOSSystemCapture {
    fn list_sources(&self) -> AudioResult<Vec<AudioSource>> {
        let mut sources = vec![AudioSource::system_audio()];

        // 获取应用音频源
        if let Ok(app_sources) = AudioCapProcess::list_sources(self.app_handle.as_ref()) {
            sources.extend(app_sources);
        }

        Ok(sources)
    }

    fn start(
        &mut self,
        source: &AudioSource,
        config: &AudioCaptureConfig,
    ) -> AudioResult<AudioStream> {
        // 检查是否已在采集
        if self.state == CaptureState::Running {
            return Err(super::types::AudioError::Other(
                "采集已在运行中".to_string(),
            ));
        }

        tracing::info!("开始采集音频源: {} ({:?})", source.name, source.source_type);

        // 创建音频流通道
        let (sender, receiver) = create_audio_stream(config.buffer_size as usize);

        // 根据音频源类型启动采集
        let process = match &source.source_type {
            AudioSourceType::SystemAudio => {
                AudioCapProcess::start_system_capture(self.app_handle.as_ref(), sender)?
            }
            AudioSourceType::Application { bundle_id, .. } => {
                AudioCapProcess::start_app_capture(self.app_handle.as_ref(), bundle_id, sender)?
            }
            AudioSourceType::Microphone => {
                return Err(super::types::AudioError::ConfigError(
                    "MacOSSystemCapture 不支持麦克风采集".to_string(),
                ));
            }
        };

        self.process = Some(process);
        self.state = CaptureState::Running;

        // 更新统计信息
        if let Ok(mut stats) = self.stats.write() {
            stats.start_time = Some(Instant::now());
            stats.total_samples = 0;
            stats.total_frames = 0;
            stats.dropped_chunks = 0;
        }

        Ok(receiver)
    }

    fn stop(&mut self) -> AudioResult<()> {
        tracing::info!("停止音频采集");

        if let Some(mut process) = self.process.take() {
            process.stop()?;
        }

        self.state = CaptureState::Stopped;
        Ok(())
    }

    fn pause(&mut self) -> AudioResult<()> {
        // AudioCapCLI 不支持暂停，只能停止
        // 暂停时我们停止进程，恢复时重新启动
        tracing::info!("暂停音频采集（停止进程）");

        if let Some(mut process) = self.process.take() {
            process.stop()?;
        }

        self.state = CaptureState::Paused;
        Ok(())
    }

    fn resume(&mut self) -> AudioResult<()> {
        // 恢复需要重新调用 start()
        tracing::warn!("AudioCapCLI 不支持恢复，请重新调用 start()");
        Err(super::types::AudioError::Other(
            "请重新调用 start() 恢复采集".to_string(),
        ))
    }

    fn state(&self) -> CaptureState {
        self.state
    }

    fn stats(&self) -> CaptureStats {
        self.stats.read().map(|s| s.clone()).unwrap_or_default()
    }
}

impl Drop for MacOSSystemCapture {
    fn drop(&mut self) {
        if self.state == CaptureState::Running {
            let _ = self.stop();
        }
    }
}

// ============================================================================
// 便捷函数
// ============================================================================

/// 列出系统音频源
pub fn list_system_sources(app_handle: Option<&tauri::AppHandle>) -> AudioResult<Vec<AudioSource>> {
    let mut sources = vec![AudioSource::system_audio()];

    if let Ok(app_sources) = AudioCapProcess::list_sources(app_handle) {
        sources.extend(app_sources);
    }

    Ok(sources)
}

