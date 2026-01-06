//! 语音识别器模块
//!
//! 封装 sherpa-rs 的流式识别功能

use sherpa_rs::streaming::{
    EndpointConfig, OnlineModelType, OnlineRecognizer, OnlineRecognizerConfig, OnlineStream,
    OnlineTransducerModelConfig,
};
use sherpa_rs::zipformer::{ZipFormer, ZipFormerConfig};

use super::model::ModelFiles;
use super::types::{AsrConfig, AsrError, AsrResult, RecognitionResult, WordTimestamp};

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

/// 流式识别器
///
/// 使用 sherpa-onnx OnlineRecognizer 进行真正的流式识别
pub struct StreamingRecognizer {
    /// Online recognizer (must be kept alive for the stream)
    #[allow(dead_code)]
    recognizer: OnlineRecognizer,
    /// Online stream
    stream: OnlineStream,
    /// 配置
    config: AsrConfig,
    /// 累计处理的采样数
    total_samples: u64,
    /// 上次识别的文本（用于检测变化）
    last_text: String,
}

impl StreamingRecognizer {
    /// 从模型文件创建流式识别器
    pub fn from_model_files(model_files: &ModelFiles, config: AsrConfig) -> AsrResult<Self> {
        // 构建 OnlineRecognizer 配置
        let recognizer_config = OnlineRecognizerConfig {
            model: OnlineModelType::Transducer(OnlineTransducerModelConfig {
                encoder: model_files.encoder.to_string_lossy().to_string(),
                decoder: model_files.decoder.to_string_lossy().to_string(),
                joiner: model_files.joiner.to_string_lossy().to_string(),
            }),
            tokens: model_files.tokens.to_string_lossy().to_string(),
            sample_rate: config.sample_rate as i32,
            feature_dim: 80,
            decoding_method: config.decoding_method.as_str().to_string(),
            max_active_paths: if config.decoding_method.as_str() == "modified_beam_search" {
                4
            } else {
                1
            },
            endpoint: EndpointConfig {
                enable: true,
                // Rule 1: 有文本时，静音 1.8 秒后切断（避免句子中间停顿被切断）
                rule1_min_trailing_silence: 1.8,
                // Rule 2: 无文本时，静音 0.8 秒后切断
                rule2_min_trailing_silence: 0.8,
                // Rule 3: 最长 15 秒强制切断
                rule3_min_utterance_length: 15.0,
            },
            num_threads: Some(config.num_threads as i32),
            debug: false,
            ..Default::default()
        };

        // 创建 recognizer
        let recognizer = OnlineRecognizer::new(recognizer_config)
            .map_err(|e| AsrError::ModelLoadError(format!("创建在线识别器失败: {}", e)))?;

        // 创建 stream
        let stream = recognizer
            .create_stream()
            .map_err(|e| AsrError::ModelLoadError(format!("创建识别流失败: {}", e)))?;

        Ok(Self {
            recognizer,
            stream,
            config,
            total_samples: 0,
            last_text: String::new(),
        })
    }

    /// 接受音频波形
    ///
    /// # Arguments
    /// * `samples` - 16kHz 单声道 f32 音频采样
    pub fn accept_waveform(&mut self, samples: &[f32]) {
        if samples.is_empty() {
            return;
        }

        self.total_samples += samples.len() as u64;
        self.stream
            .accept_waveform(self.config.sample_rate as i32, samples);

        // 如果准备好了就解码
        while self.stream.is_ready() {
            self.stream.decode();
        }
    }

    /// 获取当前识别结果
    ///
    /// 返回当前的识别结果（partial result）
    pub fn get_result(&mut self) -> RecognitionResult {
        let result = self.stream.get_result();

        // 调试输出
        if !result.text.is_empty() && result.text != self.last_text {
            tracing::info!("ASR 新识别结果: '{}'", result.text);
        }

        // 检查文本是否变化
        if result.text != self.last_text && !result.text.is_empty() {
            self.last_text = result.text.clone();

            // 转换为我们的 RecognitionResult
            let timestamp_ms =
                (self.total_samples as f64 / self.config.sample_rate as f64 * 1000.0) as u64;

            // 解析 timestamps
            let word_timestamps = self.parse_timestamps(&result.tokens, &result.timestamps);

            RecognitionResult {
                text: result.text,
                is_final: false,
                confidence: 0.9, // Online 识别器没有提供置信度，使用默认值
                timestamps: word_timestamps,
                segment_id: None,
                timestamp_ms,
            }
        } else {
            RecognitionResult::empty()
        }
    }

    /// 强制获取最终结果
    ///
    /// 标记输入结束并获取最终识别结果
    pub fn finalize(&mut self) -> RecognitionResult {
        // 标记输入结束
        self.stream.input_finished();

        // 解码剩余的音频
        while self.stream.is_ready() {
            self.stream.decode();
        }

        let result = self.stream.get_result();

        if result.text.is_empty() {
            return RecognitionResult::empty();
        }

        let timestamp_ms =
            (self.total_samples as f64 / self.config.sample_rate as f64 * 1000.0) as u64;
        let word_timestamps = self.parse_timestamps(&result.tokens, &result.timestamps);

        RecognitionResult {
            text: result.text,
            is_final: true,
            confidence: 0.9,
            timestamps: word_timestamps,
            segment_id: None,
            timestamp_ms,
        }
    }

    /// 检查是否检测到端点
    pub fn is_endpoint(&self) -> bool {
        self.stream.is_endpoint()
    }

    /// 重置识别器状态
    pub fn reset(&mut self) {
        self.stream.reset();
        self.last_text.clear();
    }

    /// 获取已处理的音频时长（秒）
    pub fn processed_duration_secs(&self) -> f64 {
        self.total_samples as f64 / self.config.sample_rate as f64
    }

    /// 获取配置
    pub fn config(&self) -> &AsrConfig {
        &self.config
    }

    /// 完全重置
    pub fn full_reset(&mut self) {
        self.reset();
        self.total_samples = 0;
    }

    /// 解析时间戳
    fn parse_timestamps(&self, tokens: &[String], timestamps: &[f32]) -> Vec<WordTimestamp> {
        if tokens.is_empty() || timestamps.is_empty() {
            return Vec::new();
        }

        let mut result = Vec::new();

        for (i, token) in tokens.iter().enumerate() {
            if token.trim().is_empty() {
                continue;
            }

            let start = if i > 0 {
                timestamps[i - 1] as f64
            } else {
                0.0
            };
            let end = timestamps[i] as f64;

            result.push(WordTimestamp::new(token.clone(), start, end));
        }

        result
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
