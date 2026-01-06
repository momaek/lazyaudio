//! SenseVoice 精修识别器
//!
//! 使用 SenseVoice 离线模型进行 Tier2 精修识别
//! 特点：
//! - 支持标点符号
//! - 支持 ITN（逆文本归一化）
//! - 准确率比流式模型更高

use std::path::Path;
use sherpa_rs::sense_voice::{SenseVoiceConfig, SenseVoiceRecognizer};

use crate::asr::types::{AsrError, AsrResult, RecognitionResult};

/// SenseVoice 精修器
pub struct SenseVoiceRefiner {
    /// SenseVoice 识别器
    recognizer: SenseVoiceRecognizer,
}

impl SenseVoiceRefiner {
    /// 从模型目录创建 SenseVoice 识别器
    ///
    /// # Arguments
    /// * `model_dir` - SenseVoice 模型目录路径
    /// * `num_threads` - 线程数
    pub fn new(model_dir: &Path, num_threads: i32) -> AsrResult<Self> {
        // 查找模型文件
        let model_path = Self::find_model_file(model_dir)?;
        let tokens_path = Self::find_tokens_file(model_dir)?;

        tracing::info!(
            "加载 SenseVoice 模型: model={}, tokens={}",
            model_path.display(),
            tokens_path.display()
        );

        let config = SenseVoiceConfig {
            model: model_path.to_string_lossy().to_string(),
            tokens: tokens_path.to_string_lossy().to_string(),
            language: "auto".to_string(),  // 自动检测语言
            use_itn: true,                  // 启用逆文本归一化（数字、日期等）
            num_threads: Some(num_threads),
            debug: false,
            provider: None,
        };

        let recognizer = SenseVoiceRecognizer::new(config)
            .map_err(|e| AsrError::ModelLoadError(format!("创建 SenseVoice 识别器失败: {}", e)))?;

        Ok(Self { recognizer })
    }

    /// 识别音频
    ///
    /// # Arguments
    /// * `samples` - 16kHz 单声道 f32 音频数据
    ///
    /// # Returns
    /// 识别结果（带标点符号）
    pub fn recognize(&mut self, samples: &[f32]) -> RecognitionResult {
        if samples.is_empty() {
            return RecognitionResult::empty();
        }

        let result = self.recognizer.transcribe(16000, samples);
        
        if result.text.trim().is_empty() {
            RecognitionResult::empty()
        } else {
            // SenseVoice 结果通常更准确
            RecognitionResult::final_result(result.text, 0.95, 0)
        }
    }

    /// 查找模型文件
    fn find_model_file(model_dir: &Path) -> AsrResult<std::path::PathBuf> {
        // 优先使用 int8 量化模型（更快）
        let int8_path = model_dir.join("model.int8.onnx");
        if int8_path.exists() {
            return Ok(int8_path);
        }

        // 否则使用完整模型
        let full_path = model_dir.join("model.onnx");
        if full_path.exists() {
            return Ok(full_path);
        }

        Err(AsrError::ModelNotFound(format!(
            "在 {} 中找不到 SenseVoice 模型文件 (model.onnx 或 model.int8.onnx)",
            model_dir.display()
        )))
    }

    /// 查找 tokens 文件
    fn find_tokens_file(model_dir: &Path) -> AsrResult<std::path::PathBuf> {
        let tokens_path = model_dir.join("tokens.txt");
        if tokens_path.exists() {
            return Ok(tokens_path);
        }

        Err(AsrError::ModelNotFound(format!(
            "在 {} 中找不到 tokens.txt",
            model_dir.display()
        )))
    }
}

// SenseVoice 识别器是 Send + Sync 的
unsafe impl Send for SenseVoiceRefiner {}
unsafe impl Sync for SenseVoiceRefiner {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sense_voice_config() {
        // 仅测试配置创建，不测试实际识别
        let config = SenseVoiceConfig {
            model: "/path/to/model.onnx".to_string(),
            tokens: "/path/to/tokens.txt".to_string(),
            language: "auto".to_string(),
            use_itn: true,
            num_threads: Some(2),
            debug: false,
            provider: None,
        };
        
        assert!(config.use_itn);
        assert_eq!(config.language, "auto");
    }
}

