//! Deepgram 流式 ASR Provider
//!
//! 通过 WebSocket 实时发送音频数据，接收流式识别结果（partial + final）。
//! Deepgram Nova-2 模型支持多语言实时转录。

use std::collections::VecDeque;
use std::sync::mpsc;
use std::time::Duration;

use tracing::{debug, error, info, warn};

use crate::asr::types::{AsrError, AsrProviderType, AsrRecognizer, AsrResult, RecognitionResult};
use crate::storage::DeepgramConfig;

/// 音频采样率
const SAMPLE_RATE: u32 = 16000;

/// Deepgram WebSocket 响应
#[derive(Debug, serde::Deserialize)]
#[allow(dead_code)]
struct DeepgramResponse {
    /// 响应类型
    #[serde(rename = "type")]
    response_type: Option<String>,
    /// 通道结果
    channel: Option<DeepgramChannel>,
    /// 是否为最终结果
    is_final: Option<bool>,
    /// 语音开始时间（秒）
    start: Option<f64>,
    /// 语音时长（秒）
    duration: Option<f64>,
}

#[derive(Debug, serde::Deserialize)]
#[allow(dead_code)]
struct DeepgramChannel {
    alternatives: Vec<DeepgramAlternative>,
}

#[derive(Debug, serde::Deserialize)]
#[allow(dead_code)]
struct DeepgramAlternative {
    transcript: String,
    confidence: f64,
}

/// WebSocket 发送端命令
enum WsCommand {
    /// 发送音频数据
    Audio(Vec<u8>),
    /// 关闭连接
    Close,
}

/// 从 WebSocket 接收的识别结果
#[derive(Debug, Clone)]
struct WsResult {
    text: String,
    confidence: f32,
    is_final: bool,
}

/// Deepgram 流式识别器
pub struct DeepgramRecognizer {
    /// 配置（保留用于重连）
    #[allow(dead_code)]
    config: DeepgramConfig,
    /// 发送命令到 WebSocket 线程
    ws_sender: Option<mpsc::Sender<WsCommand>>,
    /// 从 WebSocket 线程接收的结果队列
    result_receiver: mpsc::Receiver<WsResult>,
    /// 最新的 partial 结果
    latest_partial: String,
    /// 待消费的 final 结果队列（FIFO，避免覆盖丢失）
    pending_finals: VecDeque<WsResult>,
    /// 已处理的音频时长（秒）
    processed_secs: f64,
    /// 连接是否就绪
    is_connected: bool,
}

impl DeepgramRecognizer {
    /// 创建并连接 Deepgram WebSocket
    pub fn new(config: DeepgramConfig) -> AsrResult<Self> {
        if config.api_key.is_empty() {
            return Err(AsrError::ConfigError(
                "Deepgram API Key 未配置".to_string(),
            ));
        }

        let (result_tx, result_rx) = mpsc::channel::<WsResult>();
        let (ws_tx, ws_rx) = mpsc::channel::<WsCommand>();
        let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();

        let config_clone = config.clone();

        // 启动 WebSocket 后台线程
        std::thread::spawn(move || {
            let rt = match tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
            {
                Ok(rt) => rt,
                Err(e) => {
                    let _ = ready_tx.send(Err(format!("创建 tokio runtime 失败: {}", e)));
                    return;
                }
            };

            rt.block_on(async {
                Self::ws_loop(config_clone, ws_rx, result_tx, ready_tx).await;
            });
        });

        // 等待连接就绪
        match ready_rx.recv_timeout(Duration::from_secs(10)) {
            Ok(Ok(())) => {
                info!(
                    base_url = %config.base_url,
                    model = %config.model,
                    "Deepgram WebSocket 连接成功"
                );
            }
            Ok(Err(e)) => {
                return Err(AsrError::Other(format!("Deepgram 连接失败: {}", e)));
            }
            Err(_) => {
                return Err(AsrError::Other("Deepgram 连接超时（10秒）".to_string()));
            }
        }

        Ok(Self {
            config,
            ws_sender: Some(ws_tx),
            result_receiver: result_rx,
            latest_partial: String::new(),
            pending_finals: VecDeque::new(),
            processed_secs: 0.0,
            is_connected: true,
        })
    }

    /// 构建 Deepgram WebSocket URL（带查询参数）
    fn build_ws_url(config: &DeepgramConfig) -> AsrResult<url::Url> {
        let mut url = url::Url::parse(&config.base_url)
            .map_err(|e| AsrError::ConfigError(format!("无效的 Deepgram URL: {}", e)))?;

        {
            let mut query = url.query_pairs_mut();
            query.append_pair("model", &config.model);
            query.append_pair("encoding", "linear16");
            query.append_pair("sample_rate", &SAMPLE_RATE.to_string());
            query.append_pair("channels", "1");
            query.append_pair("punctuate", &config.punctuate.to_string());
            query.append_pair("smart_format", &config.smart_format.to_string());
            query.append_pair("interim_results", &config.interim_results.to_string());

            if !config.language.is_empty() {
                query.append_pair("language", &config.language);
            } else {
                query.append_pair("detect_language", "true");
            }
        }

        Ok(url)
    }

    /// WebSocket 事件循环
    async fn ws_loop(
        config: DeepgramConfig,
        cmd_rx: mpsc::Receiver<WsCommand>,
        result_tx: mpsc::Sender<WsResult>,
        ready_tx: mpsc::Sender<Result<(), String>>,
    ) {
        use futures_util::{SinkExt, StreamExt};
        use tokio_tungstenite::tungstenite::client::IntoClientRequest;
        use tokio_tungstenite::tungstenite::Message;

        // 构建 URL
        let url = match Self::build_ws_url(&config) {
            Ok(u) => u,
            Err(e) => {
                let _ = ready_tx.send(Err(e.to_string()));
                return;
            }
        };

        // 构建请求（带 Authorization header）
        let mut request = match url.to_string().into_client_request() {
            Ok(r) => r,
            Err(e) => {
                let _ = ready_tx.send(Err(format!("构建 WebSocket 请求失败: {}", e)));
                return;
            }
        };

        // 安全地解析 Authorization header（避免 expect panic）
        let auth_value = match format!("Token {}", config.api_key).parse() {
            Ok(v) => v,
            Err(e) => {
                let _ = ready_tx.send(Err(format!(
                    "API Key 包含无效字符，无法构建 Authorization header: {}",
                    e
                )));
                return;
            }
        };
        request
            .headers_mut()
            .insert("Authorization", auth_value);

        // 连接 WebSocket
        let ws_stream = match tokio_tungstenite::connect_async(request).await {
            Ok((stream, _response)) => {
                let _ = ready_tx.send(Ok(()));
                stream
            }
            Err(e) => {
                let _ = ready_tx.send(Err(format!("WebSocket 连接失败: {}", e)));
                return;
            }
        };

        let (mut ws_write, mut ws_read) = ws_stream.split();

        // 启动接收任务
        let result_tx_clone = result_tx.clone();
        let recv_task = tokio::spawn(async move {
            while let Some(msg) = ws_read.next().await {
                match msg {
                    Ok(Message::Text(text)) => {
                        if let Some(result) = Self::parse_response(&text) {
                            if result_tx_clone.send(result).is_err() {
                                break; // 接收端已关闭
                            }
                        }
                    }
                    Ok(Message::Close(_)) => {
                        debug!("Deepgram WebSocket 关闭");
                        break;
                    }
                    Err(e) => {
                        warn!("Deepgram WebSocket 接收错误: {}", e);
                        break;
                    }
                    _ => {} // Ping/Pong 等忽略
                }
            }
        });

        // 发送循环：从 cmd_rx 读取命令发送到 WebSocket
        loop {
            match cmd_rx.recv_timeout(Duration::from_millis(100)) {
                Ok(WsCommand::Audio(data)) => {
                    if let Err(e) = ws_write.send(Message::Binary(data.into())).await {
                        error!("Deepgram WebSocket 发送失败: {}", e);
                        break;
                    }
                }
                Ok(WsCommand::Close) => {
                    // 发送 CloseStream 消息
                    let close_msg = serde_json::json!({"type": "CloseStream"});
                    let _ = ws_write
                        .send(Message::Text(close_msg.to_string().into()))
                        .await;
                    // 等待接收任务完成
                    tokio::time::sleep(Duration::from_millis(500)).await;
                    break;
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    // 检查接收任务是否还活着
                    if recv_task.is_finished() {
                        debug!("Deepgram 接收任务已结束，退出发送循环");
                        break;
                    }
                    continue;
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    debug!("命令通道已断开，退出发送循环");
                    break;
                }
            }
        }

        // 关闭 WebSocket
        let _ = ws_write.close().await;
        recv_task.abort();
        info!("Deepgram WebSocket 事件循环结束");
    }

    /// 解析 Deepgram JSON 响应
    fn parse_response(text: &str) -> Option<WsResult> {
        let response: DeepgramResponse = serde_json::from_str(text).ok()?;

        // 只处理 Results 类型
        if response.response_type.as_deref() != Some("Results") {
            return None;
        }

        let channel = response.channel?;
        let alt = channel.alternatives.first()?;

        if alt.transcript.is_empty() {
            return None;
        }

        Some(WsResult {
            text: alt.transcript.clone(),
            confidence: alt.confidence as f32,
            is_final: response.is_final.unwrap_or(false),
        })
    }

    /// 消费接收队列中的所有结果，更新内部状态
    ///
    /// final 结果存入 FIFO 队列避免覆盖丢失，partial 保留最新
    fn drain_results(&mut self) {
        while let Ok(result) = self.result_receiver.try_recv() {
            if result.is_final {
                self.pending_finals.push_back(result);
            } else {
                self.latest_partial = result.text;
            }
        }
    }

    /// 将 f32 音频转换为 16-bit PCM 字节（little-endian）
    fn f32_to_pcm16(samples: &[f32]) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(samples.len() * 2);
        for &sample in samples {
            let clamped = sample.clamp(-1.0, 1.0);
            let int_sample = (clamped * 32767.0) as i16;
            bytes.extend_from_slice(&int_sample.to_le_bytes());
        }
        bytes
    }

    /// 获取当前时间戳（毫秒）
    fn now_ms() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }
}

impl AsrRecognizer for DeepgramRecognizer {
    fn accept_waveform(&mut self, samples: &[f32]) -> AsrResult<()> {
        if !self.is_connected {
            return Err(AsrError::Other("Deepgram WebSocket 未连接".to_string()));
        }

        let pcm_bytes = Self::f32_to_pcm16(samples);
        self.processed_secs += samples.len() as f64 / SAMPLE_RATE as f64;

        if let Some(ref sender) = self.ws_sender {
            sender
                .send(WsCommand::Audio(pcm_bytes))
                .map_err(|_| AsrError::Other("Deepgram 发送通道已断开".to_string()))?;
        }

        // 顺便消费积累的结果
        self.drain_results();

        Ok(())
    }

    fn get_result(&mut self) -> AsrResult<RecognitionResult> {
        self.drain_results();

        // get_result 只返回 partial 结果，final 结果由 finalize()/is_endpoint() 路径处理。
        // 这样避免同一个 final 被 get_result 反复返回但不消费的问题。
        if !self.latest_partial.is_empty() {
            return Ok(RecognitionResult::partial(
                self.latest_partial.clone(),
                Self::now_ms(),
            ));
        }

        Ok(RecognitionResult::empty())
    }

    fn is_endpoint(&self) -> bool {
        !self.pending_finals.is_empty()
    }

    fn finalize(&mut self) -> AsrResult<RecognitionResult> {
        self.drain_results();

        // 从 FIFO 队列中取出最早的 final 结果
        if let Some(result) = self.pending_finals.pop_front() {
            self.latest_partial.clear();
            return Ok(RecognitionResult::final_result(
                result.text,
                result.confidence,
                Self::now_ms(),
            ));
        }

        // 没有 final 结果，返回 partial 作为 final
        if !self.latest_partial.is_empty() {
            let text = std::mem::take(&mut self.latest_partial);
            return Ok(RecognitionResult::final_result(text, 0.5, Self::now_ms()));
        }

        Ok(RecognitionResult::empty())
    }

    fn reset(&mut self) {
        self.latest_partial.clear();
        self.pending_finals.clear();
    }

    fn full_reset(&mut self) {
        self.reset();
        self.processed_secs = 0.0;
        // 关闭 WebSocket 连接
        if let Some(ref sender) = self.ws_sender {
            let _ = sender.send(WsCommand::Close);
        }
        self.ws_sender = None;
        self.is_connected = false;
    }

    fn processed_duration_secs(&self) -> f64 {
        self.processed_secs
    }

    fn provider_type(&self) -> AsrProviderType {
        AsrProviderType::Deepgram
    }
}

impl Drop for DeepgramRecognizer {
    fn drop(&mut self) {
        if let Some(ref sender) = self.ws_sender {
            let _ = sender.send(WsCommand::Close);
        }
    }
}
