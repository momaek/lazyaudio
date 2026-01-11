//! 识别调度器
//!
//! 协调各层级识别器的执行时机，定期批量处理识别任务

use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tokio::time;

use super::result_merger::ResultMerger;
use super::segment_buffer::SegmentBuffer;
use super::tier2_recognizer::Tier2Recognizer;
use crate::asr::types::RecognitionTier;

/// 调度器配置
#[derive(Debug, Clone)]
pub struct SchedulerConfig {
    /// 是否启用 Tier 2
    pub enable_tier2: bool,
    
    /// Tier 2 检查间隔（秒）
    pub tier2_interval_secs: u64,
    
    /// Tier 2 批量大小
    pub tier2_batch_size: usize,
    
    /// 是否启用 Tier 3
    pub enable_tier3: bool,
    
    /// Tier 3 检查间隔（秒）
    pub tier3_interval_secs: u64,
    
    /// Tier 3 批量大小
    pub tier3_batch_size: usize,
}

impl Default for SchedulerConfig {
    fn default() -> Self {
        Self {
            enable_tier2: true,
            tier2_interval_secs: 5,
            tier2_batch_size: 10,
            enable_tier3: false,
            tier3_interval_secs: 60,
            tier3_batch_size: 20,
        }
    }
}

/// 多级识别调度器
pub struct MultiPassScheduler {
    /// 配置
    config: SchedulerConfig,
    
    /// 段落缓冲器
    segment_buffer: Arc<RwLock<SegmentBuffer>>,
    
    /// 结果合并器
    result_merger: Arc<ResultMerger>,
    
    /// Tier 2 识别器
    tier2_recognizer: Option<Arc<RwLock<Tier2Recognizer>>>,
    
    /// 是否正在运行
    running: Arc<RwLock<bool>>,
}

impl MultiPassScheduler {
    /// 创建新的调度器
    pub fn new(
        config: SchedulerConfig,
        segment_buffer: Arc<RwLock<SegmentBuffer>>,
        result_merger: Arc<ResultMerger>,
    ) -> Self {
        Self {
            config,
            segment_buffer,
            result_merger,
            tier2_recognizer: None,
            running: Arc::new(RwLock::new(false)),
        }
    }

    /// 设置 Tier 2 识别器
    pub fn set_tier2_recognizer(&mut self, recognizer: Arc<RwLock<Tier2Recognizer>>) {
        self.tier2_recognizer = Some(recognizer);
    }

    /// 启动调度器
    pub async fn start(&self) {
        let mut running = self.running.write().await;
        if *running {
            tracing::warn!("调度器已在运行");
            return;
        }
        *running = true;
        drop(running);

        tracing::info!("多级识别调度器已启动");

        // 启动 Tier 2 调度任务
        if self.config.enable_tier2 {
            self.start_tier2_task().await;
        }

        // 启动 Tier 3 调度任务（如果启用）
        if self.config.enable_tier3 {
            self.start_tier3_task().await;
        }
    }

    /// 停止调度器
    pub async fn stop(&self) {
        let mut running = self.running.write().await;
        *running = false;
        tracing::info!("多级识别调度器已停止");
    }

    /// 启动 Tier 2 调度任务
    async fn start_tier2_task(&self) {
        let segment_buffer = self.segment_buffer.clone();
        let result_merger = self.result_merger.clone();
        let tier2_recognizer = self.tier2_recognizer.clone();
        let running = self.running.clone();
        let interval_secs = self.config.tier2_interval_secs;
        let batch_size = self.config.tier2_batch_size;

        tokio::spawn(async move {
            let mut interval = time::interval(Duration::from_secs(interval_secs));

            loop {
                interval.tick().await;

                let is_running = *running.read().await;
                if !is_running {
                    break;
                }

                // 获取待处理的段落
                let pending_segments = {
                    let buffer = segment_buffer.read().await;
                    let total_count = buffer.len();
                    let pending = buffer.get_pending_tier2(batch_size)
                        .into_iter()
                        .map(|seg| (seg.id, seg.samples.clone()))
                        .collect::<Vec<_>>();
                    
                    tracing::info!(
                        "Tier2 调度检查: total_segments={}, pending_tier2={}", 
                        total_count, 
                        pending.len()
                    );
                    pending
                };

                if pending_segments.is_empty() {
                    continue;
                }

                tracing::info!("🎯 Tier 2 调度: 处理 {} 个段落", pending_segments.len());

                // 处理每个段落
                if let Some(ref recognizer) = tier2_recognizer {
                    for (segment_id, samples) in pending_segments {
                        // 执行 Tier 2 识别
                        let result = {
                            let mut rec = recognizer.write().await;
                            rec.recognize(&samples)
                        };

                        if !result.text.is_empty() {
                            tracing::info!(
                                "✨ Tier2 识别结果: segment={}, text='{}'",
                                segment_id,
                                result.text.chars().take(50).collect::<String>()
                            );
                        }

                        // 更新结果
                        result_merger.update_tier_result(
                            segment_id,
                            RecognitionTier::Tier2,
                            result,
                        );

                        // 标记为已处理
                        let mut buffer = segment_buffer.write().await;
                        buffer.mark_tier2_processed(segment_id);
                    }
                } else {
                    tracing::warn!("Tier2 识别器未初始化，跳过批量处理");
                }
            }

            tracing::info!("Tier 2 调度任务已退出");
        });
    }

    /// 启动 Tier 3 调度任务
    async fn start_tier3_task(&self) {
        let segment_buffer = self.segment_buffer.clone();
        let running = self.running.clone();
        let interval_secs = self.config.tier3_interval_secs;
        let batch_size = self.config.tier3_batch_size;

        tokio::spawn(async move {
            let mut interval = time::interval(Duration::from_secs(interval_secs));

            loop {
                interval.tick().await;

                let is_running = *running.read().await;
                if !is_running {
                    break;
                }

                // 获取待处理的段落
                let pending_count = {
                    let buffer = segment_buffer.read().await;
                    buffer.get_pending_tier3(batch_size).len()
                };

                if pending_count > 0 {
                    tracing::debug!("Tier 3 调度: 待处理 {} 个段落", pending_count);
                    // TODO: 实现 Tier 3 识别逻辑
                }
            }

            tracing::info!("Tier 3 调度任务已退出");
        });
    }

    /// 检查调度器是否正在运行
    pub async fn is_running(&self) -> bool {
        *self.running.read().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::asr::multi_pass::SegmentBufferConfig;

    #[tokio::test]
    async fn test_scheduler_start_stop() {
        let segment_buffer = Arc::new(RwLock::new(SegmentBuffer::with_defaults()));
        let result_merger = Arc::new(ResultMerger::new());
        let config = SchedulerConfig {
            enable_tier2: false,
            enable_tier3: false,
            ..Default::default()
        };

        let scheduler = MultiPassScheduler::new(config, segment_buffer, result_merger);
        
        assert!(!scheduler.is_running().await);
        
        scheduler.start().await;
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert!(scheduler.is_running().await);
        
        scheduler.stop().await;
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert!(!scheduler.is_running().await);
    }
}

