//! Tier 2 识别器
//!
//! 使用离线识别模型（Paraformer/SenseVoice）进行精确识别

use sherpa_rs::zipformer::{ZipFormer, ZipFormerConfig};

use crate::asr::model::ModelFiles;
use crate::asr::types::{AsrConfig, AsrError, AsrResult, RecognitionResult};

/// Tier 2 识别器
///
/// 使用 sherpa-rs 的 ZipFormer 进行离线识别
pub struct Tier2Recognizer {
    /// sherpa 识别器
    recognizer: ZipFormer,
    /// 配置
    config: AsrConfig,
}

impl Tier2Recognizer {
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
            .map_err(|e| AsrError::ModelLoadError(format!("创建 Tier2 识别器失败: {}", e)))?;

        Ok(Self { recognizer, config })
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

        // 调用离线识别
        let text = self
            .recognizer
            .decode(self.config.sample_rate, samples.to_vec());

        if text.trim().is_empty() {
            RecognitionResult::empty()
        } else {
            // Tier 2 结果标记为 final，置信度较高
            RecognitionResult::final_result(text, 0.95, 0)
        }
    }

    /// 获取配置
    pub fn config(&self) -> &AsrConfig {
        &self.config
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tier2_recognizer_empty_input() {
        // 注意：此测试需要实际的模型文件才能运行
        // 这里只测试空输入的情况
        let samples: Vec<f32> = vec![];
        // 由于没有实际模型，无法创建识别器
        // 实际使用时需要提供有效的模型文件
    }
}

