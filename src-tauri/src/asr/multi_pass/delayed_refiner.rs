//! 延迟精修调度器
//!
//! 实现基于时间的延迟精修机制：
//! - Tier1 结果产生后，启动独立定时器
//! - 延迟 N 秒后执行 Tier2 精修
//! - 精修结果原地替换原文本
//!
//! ## 使用方式
//!
//! ```ignore
//! // 创建配置
//! let config = DelayedRefineConfig {
//!     enabled: true,
//!     delay_ms: 3000,  // 3秒后精修
//!     ..Default::default()
//! };
//!
//! // 创建调度器（可选 Tier2Recognizer）
//! let refiner = DelayedRefiner::new(config, None);
//!
//! // 设置回调
//! refiner.set_callback(Arc::new(|result| {
//!     // 处理精修结果，发送事件更新 UI
//! })).await;
//!
//! // 在 Tier1 final 后调度精修
//! refiner.schedule(session_id, segment_id, audio_samples, tier1_text, start, end).await;
//! ```

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::sync::RwLock;

use super::sense_voice_refiner::SenseVoiceRefiner;

/// 延迟精修配置
#[derive(Debug, Clone)]
pub struct DelayedRefineConfig {
    /// 是否启用延迟精修
    pub enabled: bool,

    /// 延迟时间（毫秒），推荐 2000-5000
    pub delay_ms: u64,

    /// 最大并发精修任务数
    pub max_concurrent: usize,

    /// 单次精修超时（毫秒）
    pub timeout_ms: u64,
}

impl Default for DelayedRefineConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            delay_ms: 3000,      // 默认 3 秒后精修
            max_concurrent: 5,   // 最多 5 个并发
            timeout_ms: 10000,   // 10 秒超时
        }
    }
}

/// 精修结果
#[derive(Debug, Clone)]
pub struct RefineResult {
    /// 段落 ID
    pub segment_id: String,
    /// Session ID
    pub session_id: String,
    /// 精修后的文本
    pub text: String,
    /// 置信度
    pub confidence: f32,
    /// 原始 Tier1 文本（用于比较）
    pub tier1_text: String,
    /// 是否有实质性变化
    pub has_changed: bool,
}

/// 精修结果回调类型
pub type RefineCallback = Arc<dyn Fn(RefineResult) + Send + Sync>;

/// 待处理的精修任务
struct PendingRefineTask {
    /// 段落 ID
    segment_id: String,
    /// Session ID
    session_id: String,
    /// 缓存的音频数据 (16kHz mono f32)
    audio_samples: Vec<f32>,
    /// Tier1 原始文本
    tier1_text: String,
    /// 调度时间
    scheduled_at: Instant,
    /// 到期时间（何时执行精修）
    ready_at: Instant,
}

/// 延迟精修调度器
///
/// 每个 Tier1 segment 完成后，启动一个独立的定时任务，
/// 在指定延迟后执行 Tier2 精修，并通过回调通知结果
pub struct DelayedRefiner {
    /// 配置
    config: DelayedRefineConfig,
    /// 内部状态
    inner: Arc<DelayedRefinerInner>,
}

struct DelayedRefinerInner {
    /// 配置
    config: DelayedRefineConfig,
    /// SenseVoice 离线识别器（可选，没有时直接确认原文）
    sense_voice: Option<Arc<std::sync::Mutex<SenseVoiceRefiner>>>,
    /// 待处理任务 Map (segment_id -> PendingTask)
    pending_tasks: RwLock<HashMap<String, PendingRefineTask>>,
    /// 结果回调
    on_result: RwLock<Option<RefineCallback>>,
    /// 是否正在运行
    running: AtomicBool,
}

impl DelayedRefiner {
    /// 创建新的延迟精修调度器
    ///
    /// # Arguments
    /// * `config` - 延迟精修配置
    /// * `sense_voice` - SenseVoice 离线识别器（可选，没有时直接确认原文）
    pub fn new(
        config: DelayedRefineConfig,
        sense_voice: Option<SenseVoiceRefiner>,
    ) -> Self {
        let inner = Arc::new(DelayedRefinerInner {
            config: config.clone(),
            sense_voice: sense_voice.map(|sv| Arc::new(std::sync::Mutex::new(sv))),
            pending_tasks: RwLock::new(HashMap::new()),
            on_result: RwLock::new(None),
            running: AtomicBool::new(true),
        });

        Self { config, inner }
    }

    /// 创建不带识别器的调度器（直接确认原文）
    pub fn without_recognizer(config: DelayedRefineConfig) -> Self {
        Self::new(config, None)
    }

    /// 使用 SenseVoice 模型创建调度器
    ///
    /// # Arguments
    /// * `config` - 延迟精修配置
    /// * `model_dir` - SenseVoice 模型目录
    /// * `num_threads` - 识别线程数
    pub fn with_sense_voice(
        config: DelayedRefineConfig,
        model_dir: &std::path::Path,
        num_threads: i32,
    ) -> Result<Self, crate::asr::types::AsrError> {
        let sense_voice = SenseVoiceRefiner::new(model_dir, num_threads)?;
        tracing::info!("SenseVoice 精修器已创建");
        Ok(Self::new(config, Some(sense_voice)))
    }

    /// 设置结果回调
    pub async fn set_callback(&self, callback: RefineCallback) {
        let mut on_result = self.inner.on_result.write().await;
        *on_result = Some(callback);
    }

    /// 调度一个 segment 的延迟精修
    ///
    /// 在 Tier1 final 产生后调用
    ///
    /// # Arguments
    /// * `session_id` - Session ID
    /// * `segment_id` - 段落 ID
    /// * `audio_samples` - 音频数据 (16kHz mono f32)
    /// * `tier1_text` - Tier1 识别结果
    pub async fn schedule(
        &self,
        session_id: String,
        segment_id: String,
        audio_samples: Vec<f32>,
        tier1_text: String,
    ) {
        if !self.config.enabled {
            tracing::debug!("延迟精修已禁用，跳过 segment: {}", segment_id);
            return;
        }

        if !self.inner.running.load(Ordering::SeqCst) {
            tracing::debug!("延迟精修已停止，跳过 segment: {}", segment_id);
            return;
        }

        // 检查并发限制
        {
            let tasks = self.inner.pending_tasks.read().await;
            if tasks.len() >= self.config.max_concurrent {
                tracing::warn!(
                    "延迟精修任务已达上限 ({})，跳过 segment: {}",
                    self.config.max_concurrent,
                    segment_id
                );
                return;
            }
        }

        let delay = Duration::from_millis(self.config.delay_ms);
        let now = Instant::now();
        let ready_at = now + delay;

        tracing::info!(
            "调度延迟精修: segment={}, delay={}ms, audio_len={}, ready_in={:?}",
            segment_id,
            self.config.delay_ms,
            audio_samples.len(),
            delay
        );

        // 保存任务信息（不启动定时器，由主循环主动 poll）
        let task = PendingRefineTask {
            segment_id: segment_id.clone(),
            session_id,
            audio_samples,
            tier1_text,
            scheduled_at: now,
            ready_at,
        };

        let mut tasks = self.inner.pending_tasks.write().await;
        tasks.insert(segment_id, task);
    }

    /// 主动检查并执行到期的精修任务
    /// 
    /// 主循环应该定期调用此方法（例如每 100ms）
    pub async fn poll_ready(&self) {
        let now = Instant::now();
        
        // 找出所有到期的任务
        let ready_tasks: Vec<PendingRefineTask> = {
            let mut tasks = self.inner.pending_tasks.write().await;
            let ready_ids: Vec<String> = tasks
                .iter()
                .filter(|(_, t)| now >= t.ready_at)
                .map(|(k, _)| k.clone())
                .collect();
            
            ready_ids
                .into_iter()
                .filter_map(|k| tasks.remove(&k))
                .collect()
        };

        // 执行到期的任务
        for task in ready_tasks {
            tracing::info!(
                "执行延迟精修（已到期 {:?}）: segment={}",
                now.duration_since(task.ready_at),
                task.segment_id
            );
            self.inner.execute_refine_task(task).await;
        }
    }

    /// 取消某个 segment 的待处理任务
    pub async fn cancel(&self, segment_id: &str) {
        let mut tasks = self.inner.pending_tasks.write().await;
        if tasks.remove(segment_id).is_some() {
            tracing::debug!("取消延迟精修: segment={}", segment_id);
        }
    }

    /// Session 结束时：立即处理所有待精修任务（不再等待）
    pub async fn flush_session(&self, session_id: &str) {
        let tasks_to_process: Vec<PendingRefineTask> = {
            let mut tasks = self.inner.pending_tasks.write().await;
            let session_tasks: Vec<String> = tasks
                .iter()
                .filter(|(_, t)| t.session_id == session_id)
                .map(|(k, _)| k.clone())
                .collect();

            session_tasks
                .into_iter()
                .filter_map(|k| tasks.remove(&k))
                .collect()
        };

        if tasks_to_process.is_empty() {
            return;
        }

        tracing::info!(
            "Session 结束，立即精修 {} 个待处理段落: {}",
            tasks_to_process.len(),
            session_id
        );

        // 立即执行所有待处理任务（不再等待延迟）
        for task in tasks_to_process {
            self.inner.execute_refine_task(task).await;
        }
    }

    /// 停止调度器
    pub async fn stop(&self) {
        self.inner.running.store(false, Ordering::SeqCst);

        // 清除所有待处理任务
        let mut tasks = self.inner.pending_tasks.write().await;
        let count = tasks.len();
        tasks.clear();

        tracing::info!("延迟精修调度器已停止，丢弃 {} 个待处理任务", count);
    }

    /// 获取待处理任务数
    pub async fn pending_count(&self) -> usize {
        let tasks = self.inner.pending_tasks.read().await;
        tasks.len()
    }

    /// 检查是否正在运行
    pub fn is_running(&self) -> bool {
        self.inner.running.load(Ordering::SeqCst)
    }

    /// 获取配置
    pub fn config(&self) -> &DelayedRefineConfig {
        &self.config
    }
}

impl DelayedRefinerInner {
    /// 执行精修（定时器触发后调用）
    async fn execute_refine(&self, segment_id: &str) {
        // 取出任务
        let task = {
            let mut tasks = self.pending_tasks.write().await;
            tasks.remove(segment_id)
        };

        let Some(task) = task else {
            tracing::debug!("精修任务已被取消或不存在: {}", segment_id);
            return;
        };

        self.execute_refine_task(task).await;
    }

    /// 执行精修任务
    async fn execute_refine_task(&self, task: PendingRefineTask) {
        let segment_id = task.segment_id.clone();
        let elapsed = task.scheduled_at.elapsed();

        tracing::debug!(
            "执行 SenseVoice 精修: segment={}, elapsed={:?}, samples={}",
            segment_id,
            elapsed,
            task.audio_samples.len()
        );

        // 执行 SenseVoice 离线识别
        let (tier2_text, confidence) = if let Some(ref sense_voice) = self.sense_voice {
            // 有 SenseVoice，执行真正的离线识别
            let timeout = Duration::from_millis(self.config.timeout_ms);
            let samples = task.audio_samples.clone();
            let sv = sense_voice.clone();
            
            // 在阻塞线程中执行（因为 SenseVoice 不是 async）
            let result = tokio::time::timeout(timeout, tokio::task::spawn_blocking(move || {
                let mut recognizer = sv.lock().unwrap();
                recognizer.recognize(&samples)
            }))
            .await;

            match result {
                Ok(Ok(r)) => {
                    tracing::debug!(
                        "SenseVoice 识别完成: '{}' (confidence={})",
                        r.text,
                        r.confidence
                    );
                    (r.text, r.confidence)
                }
                Ok(Err(e)) => {
                    tracing::warn!("SenseVoice 识别任务失败: segment={}, error={:?}", segment_id, e);
                    (task.tier1_text.clone(), 0.9)
                }
                Err(_) => {
                    tracing::warn!("SenseVoice 精修超时: segment={}", segment_id);
                    (task.tier1_text.clone(), 0.9)
                }
            }
        } else {
            // 没有 SenseVoice，直接确认原文
            tracing::debug!(
                "无 SenseVoice 识别器，直接确认原文: segment={}",
                segment_id
            );
            (task.tier1_text.clone(), 0.95)
        };

        // 检查是否有实质性变化
        let tier2_text_trimmed = tier2_text.trim();
        let tier1_text_trimmed = task.tier1_text.trim();
        let has_changed = tier2_text_trimmed != tier1_text_trimmed;

        let refine_result = RefineResult {
            segment_id: task.segment_id,
            session_id: task.session_id,
            text: if tier2_text_trimmed.is_empty() {
                task.tier1_text.clone()
            } else {
                tier2_text
            },
            confidence,
            tier1_text: task.tier1_text,
            has_changed,
        };

        if has_changed {
            tracing::info!(
                "Tier2 精修完成 (有变化): '{}' -> '{}'",
                refine_result.tier1_text,
                refine_result.text
            );
        } else {
            tracing::debug!(
                "Tier2 精修完成 (确认): '{}'",
                refine_result.text
            );
        }

        // 触发回调
        let on_result = self.on_result.read().await;
        if let Some(ref callback) = *on_result {
            callback(refine_result);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;

    // 由于 Tier2Recognizer 需要实际模型，这里只测试配置和基本逻辑

    #[test]
    fn test_config_default() {
        let config = DelayedRefineConfig::default();
        assert!(config.enabled);
        assert_eq!(config.delay_ms, 3000);
        assert_eq!(config.max_concurrent, 5);
        assert_eq!(config.timeout_ms, 10000);
    }

    #[test]
    fn test_refine_result() {
        let result = RefineResult {
            segment_id: "test-123".to_string(),
            session_id: "session-456".to_string(),
            text: "精修后的文本".to_string(),
            confidence: 0.95,
            tier1_text: "原始文本".to_string(),
            has_changed: true,
        };

        assert!(result.has_changed);
        assert_eq!(result.text, "精修后的文本");
    }

    #[tokio::test]
    async fn test_callback_invocation() {
        // 测试回调机制（不涉及实际识别）
        let call_count = Arc::new(AtomicUsize::new(0));
        let call_count_clone = call_count.clone();

        let callback: RefineCallback = Arc::new(move |_result| {
            call_count_clone.fetch_add(1, Ordering::SeqCst);
        });

        // 直接测试 RefineResult 创建
        let result = RefineResult {
            segment_id: "test".to_string(),
            session_id: "session".to_string(),
            text: "test".to_string(),
            confidence: 0.9,
            tier1_text: "test".to_string(),
            has_changed: false,
        };

        callback(result);
        assert_eq!(call_count.load(Ordering::SeqCst), 1);
    }
}

