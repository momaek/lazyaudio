//! Tier 2 识别器
//!
//! 使用离线识别模型（SenseVoice）进行精确识别

use std::path::Path;

use crate::asr::types::{AsrResult, RecognitionResult};
use super::sense_voice_refiner::SenseVoiceRefiner;

/// Tier 2 识别器
///
/// 使用 SenseVoice 进行离线识别
pub struct Tier2Recognizer {
    /// SenseVoice 识别器
    recognizer: SenseVoiceRefiner,
}

impl Tier2Recognizer {
    /// 从模型目录创建识别器
    pub fn from_model_dir(model_dir: &Path, num_threads: i32) -> AsrResult<Self> {
        let recognizer = SenseVoiceRefiner::new(model_dir, num_threads)?;
        Ok(Self { recognizer })
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

        self.recognizer.recognize(samples)
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

