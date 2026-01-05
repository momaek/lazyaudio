//! 语音识别器模块
//!
//! 封装 sherpa-rs 的识别功能
//! 
//! 注意：当前 sherpa-rs 版本只支持离线识别，
//! 我们使用 VAD 分段 + 离线识别来实现近实时效果

use sherpa_rs::zipformer::{ZipFormer, ZipFormerConfig};

use super::model::ModelFiles;
use super::types::{AsrConfig, AsrError, AsrResult, RecognitionResult};

/// 离线语音识别器
///
/// 使用 sherpa-rs 的 ZipFormer 进行离线识别
pub struct OfflineRecognizer {
    /// sherpa 识别器
    recognizer: ZipFormer,
    /// 配置
    config: AsrConfig,
    /// 累计处理的采样数
    total_samples: u64,
}

impl OfflineRecognizer {
    /// 从模型文件创建识别器
    pub fn from_model_files(model_files: &ModelFiles, config: AsrConfig) -> AsrResult<Self> {
        let zipformer_config = ZipFormerConfig {
            encoder: model_files.encoder.to_string_lossy().to_string(),
            decoder: model_files.decoder.to_string_lossy().to_string(),
            joiner: model_files.joiner.to_string_lossy().to_string(),
            tokens: model_files.tokens.to_string_lossy().to_string(),
            num_threads: Some(config.num_threads as i32),
            debug: false,
            provider: None,
        };

        let recognizer = ZipFormer::new(zipformer_config)
            .map_err(|e| AsrError::ModelLoadError(format!("创建识别器失败: {}", e)))?;

        Ok(Self {
            recognizer,
            config,
            total_samples: 0,
        })
    }

    /// 识别完整的音频段落
    ///
    /// # Arguments
    /// * `samples` - 16kHz 单声道 f32 音频采样
    ///
    /// # Returns
    /// 识别结果
    pub fn recognize(&mut self, samples: &[f32]) -> RecognitionResult {
        if samples.is_empty() {
            return RecognitionResult::empty();
        }

        self.total_samples += samples.len() as u64;
        let timestamp_ms = (self.total_samples as f64 / self.config.sample_rate as f64 * 1000.0) as u64;

        // 调用离线识别
        let text = self.recognizer.decode(self.config.sample_rate, samples.to_vec());

        if text.trim().is_empty() {
            RecognitionResult::empty()
        } else {
            RecognitionResult::final_result(text, 0.9, timestamp_ms)
        }
    }

    /// 获取已处理的音频时长（秒）
    pub fn processed_duration_secs(&self) -> f64 {
        self.total_samples as f64 / self.config.sample_rate as f64
    }

    /// 获取配置
    pub fn config(&self) -> &AsrConfig {
        &self.config
    }

    /// 重置状态
    pub fn reset(&mut self) {
        self.total_samples = 0;
    }
}

/// 流式识别器（模拟）
///
/// 使用缓冲区累积音频，定期进行识别以模拟流式效果
/// 真正的流式识别需要 sherpa-onnx 的 OnlineRecognizer API
pub struct StreamingRecognizer {
    /// 离线识别器
    offline: OfflineRecognizer,
    /// 音频缓冲区
    buffer: Vec<f32>,
    /// 缓冲区阈值（达到此采样数后进行识别）
    buffer_threshold: usize,
    /// 上次识别的文本
    last_text: String,
}

impl StreamingRecognizer {
    /// 从模型文件创建流式识别器
    pub fn from_model_files(model_files: &ModelFiles, config: AsrConfig) -> AsrResult<Self> {
        let offline = OfflineRecognizer::from_model_files(model_files, config.clone())?;
        
        // 默认每 2 秒进行一次识别
        let buffer_threshold = config.sample_rate as usize * 2;

        Ok(Self {
            offline,
            buffer: Vec::new(),
            buffer_threshold,
            last_text: String::new(),
        })
    }

    /// 接受音频波形
    ///
    /// # Arguments
    /// * `samples` - 16kHz 单声道 f32 音频采样
    pub fn accept_waveform(&mut self, samples: &[f32]) {
        self.buffer.extend_from_slice(samples);
    }

    /// 获取当前识别结果
    ///
    /// 如果缓冲区足够大，会进行识别并返回结果
    pub fn get_result(&mut self) -> RecognitionResult {
        if self.buffer.len() < self.buffer_threshold / 4 {
            // 缓冲区太小，返回空结果
            return RecognitionResult::empty();
        }

        // 进行识别
        let result = self.offline.recognize(&self.buffer);

        // 检查文本是否变化
        if result.text != self.last_text && !result.text.is_empty() {
            self.last_text = result.text.clone();
            RecognitionResult::partial(result.text, result.timestamp_ms)
        } else {
            RecognitionResult::empty()
        }
    }

    /// 强制获取最终结果
    ///
    /// 识别所有缓冲的音频并返回最终结果
    pub fn finalize(&mut self) -> RecognitionResult {
        if self.buffer.is_empty() {
            return RecognitionResult::empty();
        }

        let mut result = self.offline.recognize(&self.buffer);
        result.is_final = true;
        self.buffer.clear();
        self.last_text.clear();
        result
    }

    /// 重置识别器状态
    pub fn reset(&mut self) {
        self.buffer.clear();
        self.last_text.clear();
        self.offline.reset();
    }

    /// 获取已处理的音频时长（秒）
    pub fn processed_duration_secs(&self) -> f64 {
        self.offline.processed_duration_secs()
    }

    /// 获取配置
    pub fn config(&self) -> &AsrConfig {
        self.offline.config()
    }

    /// 完全重置
    pub fn full_reset(&mut self) {
        self.reset();
    }
}

/// 批量识别器
///
/// 用于处理完整的音频文件
pub struct BatchRecognizer {
    config: AsrConfig,
    model_files: ModelFiles,
}

impl BatchRecognizer {
    /// 创建批量识别器
    pub fn new(model_files: ModelFiles, config: AsrConfig) -> Self {
        Self { config, model_files }
    }

    /// 识别完整音频
    ///
    /// # Arguments
    /// * `samples` - 16kHz 单声道 f32 音频采样
    ///
    /// # Returns
    /// 完整的识别结果
    pub fn recognize(&self, samples: &[f32]) -> AsrResult<RecognitionResult> {
        let mut recognizer = OfflineRecognizer::from_model_files(&self.model_files, self.config.clone())?;
        let result = recognizer.recognize(samples);
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_recognition_result_empty() {
        let result = RecognitionResult::empty();
        assert!(result.is_empty());
        assert!(!result.is_final);
    }

    #[test]
    fn test_recognition_result_partial() {
        let result = RecognitionResult::partial("测试".to_string(), 1000);
        assert!(!result.is_empty());
        assert!(!result.is_final);
        assert_eq!(result.text, "测试");
    }

    #[test]
    fn test_recognition_result_final() {
        let result = RecognitionResult::final_result("测试文本".to_string(), 0.95, 2000);
        assert!(!result.is_empty());
        assert!(result.is_final);
        assert_eq!(result.confidence, 0.95);
    }
}
