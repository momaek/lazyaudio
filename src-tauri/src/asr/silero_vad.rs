//! Silero VAD 语音活动检测模块
//!
//! 使用 sherpa-onnx 的 Silero VAD 进行精确的语音段落切分，
//! 避免在句子中间被错误切断。

use std::path::Path;

use sherpa_rs::silero_vad::{SileroVad as SherpaVad, SileroVadConfig};

use super::types::{AsrError, AsrResult};

/// VAD 检测结果
#[derive(Debug, Clone)]
pub enum VadEvent {
    /// 检测到语音开始
    SpeechStart,
    /// 语音进行中
    SpeechContinue,
    /// 检测到语音结束，返回完整的语音段落
    SpeechEnd(VadSegment),
    /// 静音状态
    Silence,
}

/// VAD 分割出的语音段落
#[derive(Debug, Clone)]
pub struct VadSegment {
    /// 开始位置（采样点）
    pub start_sample: i32,
    /// 音频数据
    pub samples: Vec<f32>,
    /// 时长（秒）
    pub duration_secs: f32,
}

/// Silero VAD 配置
#[derive(Debug, Clone)]
pub struct VadConfig {
    /// 模型文件路径
    pub model_path: String,
    /// 最小静音时长（秒）- 静音多久后认为语音结束
    pub min_silence_duration: f32,
    /// 最小语音时长（秒）- 少于此时长的语音会被忽略
    pub min_speech_duration: f32,
    /// 最大语音时长（秒）- 超过此时长强制切断
    pub max_speech_duration: f32,
    /// 语音检测阈值 (0.0 - 1.0)
    pub threshold: f32,
    /// 采样率
    pub sample_rate: u32,
    /// 窗口大小（采样点数）
    pub window_size: i32,
    /// 线程数
    pub num_threads: i32,
}

impl Default for VadConfig {
    fn default() -> Self {
        Self {
            model_path: String::new(),
            // 静音 0.8 秒后认为语音结束（比 endpoint 更智能）
            min_silence_duration: 0.8,
            // 最短语音 0.3 秒
            min_speech_duration: 0.3,
            // 最长语音 20 秒
            max_speech_duration: 20.0,
            // 检测阈值
            threshold: 0.5,
            // 16kHz 采样率
            sample_rate: 16000,
            // 512 采样点窗口
            window_size: 512,
            // 单线程
            num_threads: 1,
        }
    }
}

/// Silero VAD 封装
pub struct SileroVadWrapper {
    vad: SherpaVad,
    config: VadConfig,
    /// 是否在语音状态
    in_speech: bool,
}

impl SileroVadWrapper {
    /// 创建新的 VAD 实例
    pub fn new(config: VadConfig) -> AsrResult<Self> {
        let sherpa_config = SileroVadConfig {
            model: config.model_path.clone(),
            min_silence_duration: config.min_silence_duration,
            min_speech_duration: config.min_speech_duration,
            max_speech_duration: config.max_speech_duration,
            threshold: config.threshold,
            sample_rate: config.sample_rate,
            window_size: config.window_size,
            num_threads: Some(config.num_threads),
            ..Default::default()
        };

        // 缓冲区大小：30 秒
        let buffer_size_in_seconds = 30.0;

        let vad = SherpaVad::new(sherpa_config, buffer_size_in_seconds)
            .map_err(|e| AsrError::ModelLoadError(format!("创建 Silero VAD 失败: {}", e)))?;

        Ok(Self {
            vad,
            config,
            in_speech: false,
        })
    }

    /// 从模型目录创建 VAD
    pub fn from_model_dir(model_dir: &Path, config: VadConfig) -> AsrResult<Self> {
        let model_path = model_dir.join("silero_vad.onnx");
        if !model_path.exists() {
            return Err(AsrError::ModelNotFound(format!(
                "VAD 模型文件不存在: {}",
                model_path.display()
            )));
        }

        let config = VadConfig {
            model_path: model_path.to_string_lossy().to_string(),
            ..config
        };

        Self::new(config)
    }

    /// 处理音频数据
    ///
    /// 返回检测到的语音段落（如果有）
    pub fn process(&mut self, samples: &[f32]) -> Vec<VadSegment> {
        // 喂入音频数据
        self.vad.accept_waveform(samples.to_vec());

        // 收集所有完整的语音段落
        let mut segments = Vec::new();

        while !self.vad.is_empty() {
            let segment = self.vad.front();
            let duration_secs = segment.samples.len() as f32 / self.config.sample_rate as f32;

            segments.push(VadSegment {
                start_sample: segment.start,
                samples: segment.samples,
                duration_secs,
            });

            self.vad.pop();
        }

        // 更新语音状态
        self.in_speech = self.vad.is_speech();

        segments
    }

    /// 检查当前是否在语音状态
    pub fn is_speech(&self) -> bool {
        self.in_speech
    }

    /// 强制结束当前语音（用于 session 结束时）
    pub fn flush(&mut self) -> Vec<VadSegment> {
        self.vad.flush();

        let mut segments = Vec::new();
        while !self.vad.is_empty() {
            let segment = self.vad.front();
            let duration_secs = segment.samples.len() as f32 / self.config.sample_rate as f32;

            segments.push(VadSegment {
                start_sample: segment.start,
                samples: segment.samples,
                duration_secs,
            });

            self.vad.pop();
        }

        self.in_speech = false;
        segments
    }

    /// 重置 VAD 状态
    pub fn reset(&mut self) {
        self.vad.clear();
        self.in_speech = false;
    }

    /// 获取配置
    pub fn config(&self) -> &VadConfig {
        &self.config
    }
}

/// VAD 模型 ID
pub const VAD_MODEL_ID: &str = "silero-vad";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vad_config_default() {
        let config = VadConfig::default();
        assert_eq!(config.sample_rate, 16000);
        assert_eq!(config.threshold, 0.5);
    }
}

