//! ASR 管道模块
//!
//! 将 VAD、重采样和 ASR 集成到统一的处理管道

use tokio::sync::mpsc as tokio_mpsc;

use crate::audio::speech_segment::SpeechSegment;
use crate::audio::vad::{VadConfig, VadState, VoiceActivityDetector};
use crate::audio::{AudioChunk, Resampler};

use super::recognizer::StreamingRecognizer;
use super::types::{AsrConfig, AsrError, AsrResult, RecognitionResult};

/// ASR 管道配置
#[derive(Debug, Clone)]
pub struct AsrPipelineConfig {
    /// VAD 配置
    pub vad_config: VadConfig,
    /// ASR 配置
    pub asr_config: AsrConfig,
    /// 是否启用 VAD（禁用时所有音频都送入 ASR）
    pub enable_vad: bool,
    /// 识别结果通道缓冲大小
    pub result_buffer_size: usize,
    /// 输入采样率（重采样前）
    pub input_sample_rate: u32,
    /// 输入通道数
    pub input_channels: u16,
}

impl Default for AsrPipelineConfig {
    fn default() -> Self {
        Self {
            vad_config: VadConfig::default(),
            asr_config: AsrConfig::default(),
            enable_vad: true,
            result_buffer_size: 100,
            input_sample_rate: 48000,
            input_channels: 2,
        }
    }
}

/// ASR 管道
///
/// 处理流程: 音频输入 → 重采样 → VAD → ASR → 识别结果
pub struct AsrPipeline {
    /// 重采样器（如果需要）
    resampler: Option<Resampler>,
    /// VAD 检测器
    vad: Option<VoiceActivityDetector>,
    /// 流式识别器
    recognizer: StreamingRecognizer,
    /// 配置
    config: AsrPipelineConfig,
    /// 识别结果发送端
    result_tx: tokio_mpsc::Sender<RecognitionResult>,
    /// 当前段落 ID
    current_segment_id: u64,
    /// 累计采样数（用于计算时间戳）
    total_samples: u64,
    /// 是否处于语音状态
    in_speech: bool,
}

impl AsrPipeline {
    /// 创建新的 ASR 管道
    pub fn new(
        recognizer: StreamingRecognizer,
        config: AsrPipelineConfig,
    ) -> (Self, tokio_mpsc::Receiver<RecognitionResult>) {
        let (result_tx, result_rx) = tokio_mpsc::channel(config.result_buffer_size);

        // 创建重采样器（如果输入不是 16kHz 单声道）
        let resampler = if config.input_sample_rate != 16000 || config.input_channels != 1 {
            Resampler::new(config.input_sample_rate, 16000, config.input_channels as usize).ok()
        } else {
            None
        };

        // 创建 VAD
        let vad = if config.enable_vad {
            Some(VoiceActivityDetector::new(config.vad_config.clone()))
        } else {
            None
        };

        let pipeline = Self {
            resampler,
            vad,
            recognizer,
            config,
            result_tx,
            current_segment_id: 0,
            total_samples: 0,
            in_speech: false,
        };

        (pipeline, result_rx)
    }

    /// 处理音频数据块
    ///
    /// # Arguments
    /// * `chunk` - 音频数据块
    pub async fn process(&mut self, chunk: &AudioChunk) -> AsrResult<()> {
        // 重采样（如果需要）
        let samples = if let Some(ref mut resampler) = self.resampler {
            let resampled = resampler.process(&chunk.samples).map_err(|e| {
                AsrError::Other(format!("重采样失败: {}", e))
            })?;

            // 转换为单声道（如果是立体声）
            if self.config.input_channels == 2 {
                Self::stereo_to_mono(&resampled)
            } else {
                resampled
            }
        } else {
            // 转换为单声道（如果是立体声）
            if chunk.channels == 2 {
                Self::stereo_to_mono(&chunk.samples)
            } else {
                chunk.samples.clone()
            }
        };

        if samples.is_empty() {
            return Ok(());
        }

        // 更新采样计数
        self.total_samples += samples.len() as u64;

        // VAD 检测
        if let Some(ref mut vad) = self.vad {
            let vad_state = vad.process(&samples);

            match vad_state {
                VadState::Speech => {
                    if !self.in_speech {
                        // 语音开始
                        self.in_speech = true;
                        self.current_segment_id += 1;
                        tracing::debug!("语音开始，段落 ID: {}", self.current_segment_id);
                    }

                    // 送入识别器
                    self.recognizer.accept_waveform(&samples);

                    // 获取中间结果
                    let result = self.recognizer.get_result();
                    if !result.is_empty() {
                        let result = result.with_segment_id(self.current_segment_id);
                        self.send_result(result).await;
                    }
                }
                VadState::SpeechEnd => {
                    if self.in_speech {
                        // 语音结束，获取最终结果
                        self.recognizer.accept_waveform(&samples);

                        let mut result = self.recognizer.get_result();
                        result.is_final = true;
                        let result = result.with_segment_id(self.current_segment_id);

                        if !result.is_empty() {
                            self.send_result(result).await;
                        }

                        // 重置识别器
                        self.recognizer.reset();
                        self.in_speech = false;
                        tracing::debug!("语音结束，段落 ID: {}", self.current_segment_id);
                    }
                }
                VadState::Silence => {
                    // 静音状态，不处理
                }
            }
        } else {
            // 无 VAD，直接识别所有音频
            self.recognizer.accept_waveform(&samples);

            // 定期获取结果
            let result = self.recognizer.get_result();
            if !result.is_empty() {
                self.send_result(result).await;
            }

            // 定期重置（没有真正的端点检测）
            // 注意：真正的流式识别需要 sherpa-onnx 的 OnlineRecognizer API
        }

        Ok(())
    }

    /// 处理语音段落
    ///
    /// # Arguments
    /// * `segment` - 语音段落
    pub async fn process_segment(&mut self, segment: &SpeechSegment) -> AsrResult<RecognitionResult> {
        // 直接识别整个段落
        self.recognizer.accept_waveform(&segment.samples);

        // 处理直到获取最终结果
        let mut result = self.recognizer.get_result();
        result.is_final = segment.is_complete;
        result.segment_id = Some(segment.id);

        // 如果段落完成，重置识别器
        if segment.is_complete {
            self.recognizer.reset();
        }

        Ok(result)
    }

    /// 刷新管道
    ///
    /// 强制处理所有缓冲的数据
    pub async fn flush(&mut self) -> AsrResult<()> {
        if self.in_speech {
            // 获取最终结果
            let mut result = self.recognizer.get_result();
            result.is_final = true;
            let result = result.with_segment_id(self.current_segment_id);

            if !result.is_empty() {
                self.send_result(result).await;
            }

            self.recognizer.reset();
            self.in_speech = false;
        }

        Ok(())
    }

    /// 重置管道状态
    pub fn reset(&mut self) {
        self.recognizer.full_reset();
        if let Some(ref mut vad) = self.vad {
            vad.reset();
        }
        if let Some(ref mut resampler) = self.resampler {
            resampler.reset();
        }
        self.total_samples = 0;
        self.in_speech = false;
    }

    /// 获取配置
    pub fn config(&self) -> &AsrPipelineConfig {
        &self.config
    }

    /// 获取已处理的音频时长（秒）
    pub fn processed_duration_secs(&self) -> f64 {
        self.total_samples as f64 / 16000.0
    }

    /// 是否正在处理语音
    pub fn is_processing_speech(&self) -> bool {
        self.in_speech
    }

    /// 发送识别结果
    async fn send_result(&self, result: RecognitionResult) {
        if self.result_tx.send(result).await.is_err() {
            tracing::warn!("识别结果通道已关闭");
        }
    }

    /// 立体声转单声道
    fn stereo_to_mono(samples: &[f32]) -> Vec<f32> {
        samples
            .chunks(2)
            .map(|chunk| {
                if chunk.len() == 2 {
                    (chunk[0] + chunk[1]) / 2.0
                } else {
                    chunk[0]
                }
            })
            .collect()
    }
}

/// 简化的同步 ASR 管道（用于测试）
pub struct SyncAsrPipeline {
    recognizer: StreamingRecognizer,
    resampler: Option<Resampler>,
}

impl SyncAsrPipeline {
    /// 创建同步管道
    pub fn new(recognizer: StreamingRecognizer, input_sample_rate: u32, input_channels: u16) -> Self {
        let resampler = if input_sample_rate != 16000 || input_channels != 1 {
            Resampler::new(input_sample_rate, 16000, input_channels as usize).ok()
        } else {
            None
        };

        Self {
            recognizer,
            resampler,
        }
    }

    /// 处理音频并返回结果
    pub fn process(&mut self, samples: &[f32], channels: u16) -> RecognitionResult {
        // 重采样
        let samples = if let Some(ref mut resampler) = self.resampler {
            resampler.process(samples).unwrap_or_default()
        } else {
            samples.to_vec()
        };

        // 转单声道
        let samples = if channels == 2 {
            AsrPipeline::stereo_to_mono(&samples)
        } else {
            samples
        };

        // 识别
        self.recognizer.accept_waveform(&samples);
        self.recognizer.get_result()
    }

    /// 重置
    pub fn reset(&mut self) {
        self.recognizer.full_reset();
        if let Some(ref mut resampler) = self.resampler {
            resampler.reset();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pipeline_config_default() {
        let config = AsrPipelineConfig::default();
        assert!(config.enable_vad);
        assert_eq!(config.input_sample_rate, 48000);
        assert_eq!(config.input_channels, 2);
    }

    #[test]
    fn test_stereo_to_mono() {
        let stereo = vec![0.5, 0.3, 0.8, 0.2, 1.0, 0.0];
        let mono = AsrPipeline::stereo_to_mono(&stereo);

        assert_eq!(mono.len(), 3);
        assert!((mono[0] - 0.4).abs() < 0.001);
        assert!((mono[1] - 0.5).abs() < 0.001);
        assert!((mono[2] - 0.5).abs() < 0.001);
    }
}

