//! Multi-pass ASR Worker
//!
//! 统一的 Worker 系统，处理 Tier1/2/3 的识别任务

use std::sync::{mpsc, Arc};
use std::time::Duration;

use chrono::Utc;
use tracing::{error, info, warn};

use crate::asr::multi_pass::{ResultMerger, SegmentBuffer, Tier2Recognizer};
use crate::asr::RecognitionTier;
use crate::asr::{AsrEngine, StreamingRecognizer};
use crate::event::{AppEvent, SharedEventBus, TranscriptFinalPayload};
use crate::storage::{TranscriptSegment, TranscriptSource};

use super::types::WorkerTask;

/// MultiPass Worker 结构体
struct MultiPassWorker {
    /// SegmentBuffer（共享音频缓冲池）
    segment_buffer: Arc<tokio::sync::RwLock<SegmentBuffer>>,
    /// ResultMerger（结果合并器）
    result_merger: Arc<ResultMerger>,
    /// Tier1 流式识别器
    tier1_recognizer: StreamingRecognizer,
    /// Tier2 离线识别器（可选）
    tier2_recognizer: Option<Tier2Recognizer>,
    /// 事件总线
    event_bus: SharedEventBus,
}

impl MultiPassWorker {
    /// 创建新的 Worker
    fn new(
        segment_buffer: Arc<tokio::sync::RwLock<SegmentBuffer>>,
        result_merger: Arc<ResultMerger>,
        tier1_recognizer: StreamingRecognizer,
        tier2_recognizer: Option<Tier2Recognizer>,
        event_bus: SharedEventBus,
    ) -> Self {
        Self {
            segment_buffer,
            result_merger,
            tier1_recognizer,
            tier2_recognizer,
            event_bus,
        }
    }

    /// 处理 Tier1 任务（立即处理单个段落）
    fn process_tier1(
        &mut self,
        segment_id: String,
        buffer_id: u64,
        session_id: String,
        source: TranscriptSource,
        start_time: f64,
        end_time: f64,
    ) {
        // 1. 从 SegmentBuffer 读取音频
        let audio_samples = {
            let buffer = self.segment_buffer.blocking_read();
            match buffer.get(buffer_id) {
                Some(seg) => seg.samples.clone(),
                None => {
                    warn!("Tier1: 段落 {} 未找到 (buffer_id={})", segment_id, buffer_id);
                    return;
                }
            }
        };

        // 2. 使用 Tier1 识别器识别
        self.tier1_recognizer.accept_waveform(&audio_samples);
        let final_result = self.tier1_recognizer.finalize();
        self.tier1_recognizer.reset();

        if final_result.text.is_empty() {
            return;
        }

        info!(
            "📝 Tier1 识别结果: text='{}', word_timestamps={}",
            final_result.text.chars().take(30).collect::<String>(),
            final_result.timestamps.len()
        );

        // 3. 构建 TranscriptSegment
        let segment = TranscriptSegment {
            id: segment_id.clone(),
            start_time,
            end_time,
            text: final_result.text.clone(),
            is_final: true,
            confidence: Some(final_result.confidence),
            source: Some(source),
            speaker_id: None,
            speaker_label: None,
            language: None,
            words: if final_result.timestamps.is_empty() {
                None
            } else {
                // 词级时间戳加上段落偏移量
                let offset = start_time;
                Some(
                    final_result
                        .timestamps
                        .iter()
                        .map(|wt| {
                            let mut converted: crate::storage::WordTimestamp = wt.clone().into();
                            converted.start += offset;
                            converted.end += offset;
                            converted
                        })
                        .collect(),
                )
            },
            created_at: Utc::now().to_rfc3339(),
            tier: Some("tier1".to_string()),
        };

        info!(
            "🚀 发送 TranscriptFinal 事件: segment={}, words.len={:?}",
            segment_id,
            segment.words.as_ref().map(|w| w.len())
        );

        // 4. 发送 transcript:final 事件
        self.event_bus
            .publish(AppEvent::TranscriptFinal(TranscriptFinalPayload {
                session_id,
                segment,
            }));

        // 5. 将结果写入 ResultMerger（重要：为 Tier2 更新做准备）
        let recognition_result = crate::asr::RecognitionResult {
            text: final_result.text,
            is_final: true,
            confidence: final_result.confidence,
            timestamps: final_result.timestamps,
            segment_id: Some(buffer_id),
            timestamp_ms: (Utc::now().timestamp_millis()) as u64,
        };
        self.result_merger.add_tier1_result(buffer_id, recognition_result);
        
        info!("📋 Tier1 结果已添加到 ResultMerger: buffer_id={}", buffer_id);
    }

    /// 处理 Tier2 任务（批量处理多个段落）
    fn process_tier2(&mut self, segment_ids: Vec<u64>) {
        let Some(ref mut tier2_rec) = self.tier2_recognizer else {
            warn!("Tier2 识别器未初始化，跳过批量处理");
            return;
        };

        info!("🎯 Tier2 批量处理: {} 个段落", segment_ids.len());

        for segment_id in segment_ids {
            // 1. 从 SegmentBuffer 读取音频
            let segment_info = {
                let buffer = self.segment_buffer.blocking_read();
                match buffer.get(segment_id) {
                    Some(seg) => (seg.samples.clone(), seg.start_time, seg.end_time),
                    None => {
                        warn!("Tier2: 段落 {} 未找到", segment_id);
                        continue;
                    }
                }
            };

            let (audio_samples, _start_time, _end_time) = segment_info;

            // 2. 使用 Tier2 识别器识别
            let tier2_result = tier2_rec.recognize(&audio_samples);

            if tier2_result.text.is_empty() {
                warn!("Tier2: 段落 {} 识别结果为空", segment_id);
                continue;
            }

            info!(
                "✨ Tier2 识别结果: segment={}, text='{}'",
                segment_id,
                tier2_result.text.chars().take(30).collect::<String>()
            );

            // 3. 将结果写入 ResultMerger
            self.result_merger
                .update_tier_result(segment_id, RecognitionTier::Tier2, tier2_result);

            // 4. 标记 SegmentBuffer 为已处理
            {
                let mut buffer = self.segment_buffer.blocking_write();
                buffer.mark_tier2_processed(segment_id);
            }
        }
    }

    /// 运行 Worker 主循环
    fn run(&mut self, rx: mpsc::Receiver<WorkerTask>) {
        info!("MultiPassWorker 已启动");

        while let Ok(task) = rx.recv() {
            match task {
                WorkerTask::Tier1 {
                    segment_id,
                    buffer_id,
                    session_id,
                    source,
                    start_time,
                    end_time,
                } => {
                    self.process_tier1(segment_id, buffer_id, session_id, source, start_time, end_time);
                }
                WorkerTask::Tier2 { segment_ids } => {
                    self.process_tier2(segment_ids);
                }
                WorkerTask::Tier3 { segment_ids } => {
                    warn!("Tier3 暂未实现，跳过 {} 个段落", segment_ids.len());
                }
            }
        }

        info!("MultiPassWorker 已退出");
    }
}

/// 启动 MultiPass Worker
///
/// 返回任务发送器，用于向 Worker 发送识别任务
pub(crate) fn spawn_multipass_worker(
    segment_buffer: Arc<tokio::sync::RwLock<SegmentBuffer>>,
    result_merger: Arc<ResultMerger>,
    asr_engine: Arc<std::sync::RwLock<AsrEngine>>,
    tier2_recognizer: Option<Tier2Recognizer>,
    event_bus: SharedEventBus,
) -> Option<mpsc::Sender<WorkerTask>> {
    let (tx, rx) = mpsc::channel::<WorkerTask>();
    let (ready_tx, ready_rx) = mpsc::channel::<bool>();

    std::thread::spawn(move || {
        info!("MultiPassWorker 线程已启动，开始创建 Tier1 识别器");
        
        // 创建 Tier1 识别器
        let tier1_recognizer = match asr_engine
            .read()
            .expect("获取 ASR 锁失败")
            .create_recognizer()
        {
            Ok(r) => {
                info!("Tier1 识别器创建成功，发送就绪信号");
                let _ = ready_tx.send(true);
                r
            }
            Err(e) => {
                error!("Tier1 识别器创建失败: {}", e);
                let _ = ready_tx.send(false);
                return;
            }
        };

        // 创建 Worker 并运行
        let mut worker = MultiPassWorker::new(
            segment_buffer,
            result_merger,
            tier1_recognizer,
            tier2_recognizer,
            event_bus,
        );

        worker.run(rx);
    });

    // 等待 Worker 就绪（增加超时时间，因为创建识别器需要加载模型）
    match ready_rx.recv_timeout(Duration::from_secs(10)) {
        Ok(true) => {
            info!("MultiPassWorker 就绪");
            Some(tx)
        }
        Ok(false) => {
            error!("MultiPassWorker 初始化失败：Tier1 识别器创建失败");
            None
        }
        Err(e) => {
            error!("MultiPassWorker 初始化失败：等待超时（10秒）或通道错误 - {:?}", e);
            None
        }
    }
}
