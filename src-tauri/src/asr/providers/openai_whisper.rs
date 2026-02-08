//! OpenAI Whisper API Provider
//!
//! 批量模式 ASR 识别器：将音频累积后一次性发送到 Whisper API 获取转录结果。
//! 兼容 OpenAI Whisper API 格式的接口（如 Groq、本地 whisper.cpp 服务等）。

use std::io::Cursor;
use std::sync::mpsc;
use std::time::Duration;

use tracing::{debug, error, info};

use crate::asr::types::{AsrError, AsrProviderType, AsrRecognizer, AsrResult, RecognitionResult};
use crate::storage::OpenAiWhisperConfig;

/// 音频采样率（AsrRecognizer trait 约定输入为 16kHz mono f32）
const SAMPLE_RATE: u32 = 16000;

/// Whisper API 响应（verbose_json 格式）
#[derive(Debug, serde::Deserialize)]
struct WhisperResponse {
    /// 转录文本
    #[serde(default)]
    text: String,
    /// 语言
    #[serde(default)]
    language: Option<String>,
    /// 时长（秒）
    #[serde(default)]
    duration: Option<f64>,
    /// 段落列表
    #[serde(default)]
    segments: Option<Vec<WhisperSegment>>,
}

/// Whisper 段落
#[derive(Debug, serde::Deserialize)]
#[allow(dead_code)]
struct WhisperSegment {
    /// 文本
    #[serde(default)]
    text: String,
    /// 开始时间（秒）
    #[serde(default)]
    start: f64,
    /// 结束时间（秒）
    #[serde(default)]
    end: f64,
    /// 平均对数概率
    #[serde(default)]
    avg_logprob: Option<f64>,
}

/// OpenAI Whisper 批量模式识别器
pub struct OpenAiWhisperRecognizer {
    /// 配置
    config: OpenAiWhisperConfig,
    /// 音频缓冲区（16kHz mono f32）
    audio_buffer: Vec<f32>,
    /// 已处理的音频时长累计（秒）
    processed_secs: f64,
    /// HTTP 客户端
    client: reqwest::Client,
}

impl OpenAiWhisperRecognizer {
    /// 创建新的 OpenAI Whisper 识别器
    pub fn new(config: OpenAiWhisperConfig) -> AsrResult<Self> {
        if config.api_key.is_empty() {
            return Err(AsrError::ConfigError(
                "OpenAI Whisper API Key 未配置".to_string(),
            ));
        }

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| AsrError::Other(format!("创建 HTTP 客户端失败: {}", e)))?;

        info!(
            base_url = %config.base_url,
            model = %config.model,
            "OpenAI Whisper 识别器已创建"
        );

        Ok(Self {
            config,
            audio_buffer: Vec::new(),
            processed_secs: 0.0,
            client,
        })
    }

    /// 将 f32 音频缓冲区编码为 WAV 字节
    fn encode_wav(samples: &[f32]) -> AsrResult<Vec<u8>> {
        let mut cursor = Cursor::new(Vec::new());
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: SAMPLE_RATE,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };

        let mut writer = hound::WavWriter::new(&mut cursor, spec)
            .map_err(|e| AsrError::Other(format!("创建 WAV 编码器失败: {}", e)))?;

        for &sample in samples {
            // f32 [-1.0, 1.0] → i16
            let clamped = sample.clamp(-1.0, 1.0);
            let int_sample = (clamped * f32::from(i16::MAX)) as i16;
            writer
                .write_sample(int_sample)
                .map_err(|e| AsrError::Other(format!("WAV 写入失败: {}", e)))?;
        }

        writer
            .finalize()
            .map_err(|e| AsrError::Other(format!("WAV 结束失败: {}", e)))?;

        Ok(cursor.into_inner())
    }

    /// 同步调用 Whisper API（内部使用 channel 阻塞等待异步结果）
    fn call_api_sync(&self, wav_bytes: Vec<u8>) -> AsrResult<WhisperResponse> {
        let (tx, rx) = mpsc::channel();

        let url = format!("{}/audio/transcriptions", self.config.base_url);
        let api_key = self.config.api_key.clone();
        let model = self.config.model.clone();
        let language = self.config.language.clone();
        let response_format = self.config.response_format.clone();
        let client = self.client.clone();

        // 在新线程中执行异步 HTTP 请求（避免嵌套 tokio runtime）
        std::thread::spawn(move || {
            let rt = match tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
            {
                Ok(rt) => rt,
                Err(e) => {
                    let _ = tx.send(Err(AsrError::Other(format!(
                        "创建 tokio runtime 失败: {}",
                        e
                    ))));
                    return;
                }
            };

            let result = rt.block_on(async {
                Self::call_api_async(client, url, api_key, model, language, response_format, wav_bytes).await
            });

            let _ = tx.send(result);
        });

        // 阻塞等待结果（30 秒超时）
        rx.recv_timeout(Duration::from_secs(35))
            .map_err(|e| AsrError::Other(format!("Whisper API 调用超时: {}", e)))?
    }

    /// 异步调用 Whisper API
    async fn call_api_async(
        client: reqwest::Client,
        url: String,
        api_key: String,
        model: String,
        language: String,
        response_format: String,
        wav_bytes: Vec<u8>,
    ) -> AsrResult<WhisperResponse> {
        let file_part = reqwest::multipart::Part::bytes(wav_bytes)
            .file_name("audio.wav")
            .mime_str("audio/wav")
            .map_err(|e| AsrError::Other(format!("构建 multipart 失败: {}", e)))?;

        let mut form = reqwest::multipart::Form::new()
            .part("file", file_part)
            .text("model", model)
            .text("response_format", response_format);

        // 仅在指定语言时添加
        if !language.is_empty() {
            form = form.text("language", language);
        }

        debug!(url = %url, "发送 Whisper API 请求");

        let response = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", api_key))
            .multipart(form)
            .send()
            .await
            .map_err(|e| {
                error!(error = %e, "Whisper API 请求失败");
                AsrError::Other(format!("Whisper API 请求失败: {}", e))
            })?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            error!(status = %status, body = %body, "Whisper API 返回错误");
            return Err(AsrError::Other(format!(
                "Whisper API 错误 ({}): {}",
                status, body
            )));
        }

        let whisper_response: WhisperResponse = response
            .json()
            .await
            .map_err(|e| AsrError::Other(format!("解析 Whisper 响应失败: {}", e)))?;

        debug!(
            text_len = whisper_response.text.len(),
            language = ?whisper_response.language,
            duration = ?whisper_response.duration,
            "Whisper API 响应成功"
        );

        Ok(whisper_response)
    }

    /// 将 Whisper 响应转换为 RecognitionResult
    fn to_recognition_result(response: WhisperResponse) -> RecognitionResult {
        let text = response.text.trim().to_string();
        if text.is_empty() {
            return RecognitionResult::empty();
        }

        // 从 segments 的 avg_logprob 估算置信度
        // avg_logprob 范围 [-inf, 0]，值越大（越接近 0）表示越确定
        // 典型值：-0.3 以上为高置信度，-1.0 以下为低置信度
        let confidence = response
            .segments
            .as_ref()
            .and_then(|segs| {
                let logprobs: Vec<f64> = segs
                    .iter()
                    .filter_map(|s| s.avg_logprob)
                    .collect();
                if logprobs.is_empty() {
                    return None;
                }
                let avg_logprob = logprobs.iter().sum::<f64>() / logprobs.len() as f64;
                // 线性映射 [-1.5, 0] → [0.3, 1.0]，超出范围则 clamp
                let mapped = (avg_logprob / 1.5 + 1.0) * 0.7 + 0.3;
                Some(mapped.clamp(0.1, 1.0) as f32)
            })
            .unwrap_or(0.8); // 无 logprob 信息时默认 0.8

        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        RecognitionResult::final_result(text, confidence, now_ms)
    }
}

impl AsrRecognizer for OpenAiWhisperRecognizer {
    fn accept_waveform(&mut self, samples: &[f32]) -> AsrResult<()> {
        self.audio_buffer.extend_from_slice(samples);
        Ok(())
    }

    fn get_result(&mut self) -> AsrResult<RecognitionResult> {
        // 批量模式没有 partial results
        Ok(RecognitionResult::empty())
    }

    fn is_endpoint(&self) -> bool {
        // 批量模式不检测 endpoint，由外部 VAD 驱动
        false
    }

    fn finalize(&mut self) -> AsrResult<RecognitionResult> {
        if self.audio_buffer.is_empty() {
            return Ok(RecognitionResult::empty());
        }

        let samples = std::mem::take(&mut self.audio_buffer);
        let duration_secs = samples.len() as f64 / SAMPLE_RATE as f64;

        // 过短音频跳过（< 0.3 秒）
        if duration_secs < 0.3 {
            debug!(duration_secs, "音频过短，跳过 Whisper API 调用");
            return Ok(RecognitionResult::empty());
        }

        info!(duration_secs = format!("{:.2}", duration_secs), "开始 Whisper API 转录");

        // 编码为 WAV
        let wav_bytes = Self::encode_wav(&samples)?;

        // 调用 API
        let response = self.call_api_sync(wav_bytes)?;
        self.processed_secs += duration_secs;

        Ok(Self::to_recognition_result(response))
    }

    fn reset(&mut self) {
        self.audio_buffer.clear();
    }

    fn full_reset(&mut self) {
        self.audio_buffer.clear();
        self.processed_secs = 0.0;
    }

    fn processed_duration_secs(&self) -> f64 {
        self.processed_secs
    }

    fn provider_type(&self) -> AsrProviderType {
        AsrProviderType::OpenAiWhisper
    }
}
