//! 音频 Tee（扇出）模块
//!
//! 将单个音频流分发给多个消费者

use super::types::{create_audio_stream, AudioChunk, AudioResult, AudioStream, AudioStreamSender};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::sync::RwLock;

/// 消费者 ID 计数器
static CONSUMER_ID_COUNTER: AtomicUsize = AtomicUsize::new(0);

/// 消费者信息
struct ConsumerInfo {
    id: usize,
    sender: AudioStreamSender,
    dropped_count: AtomicUsize,
}

/// 音频 Tee（扇出器）
///
/// 接收单个音频流，并将数据复制分发给多个消费者
pub struct AudioTee {
    /// 消费者列表
    consumers: Arc<RwLock<Vec<ConsumerInfo>>>,
    /// 是否正在运行
    running: Arc<AtomicBool>,
    /// 丢弃策略：true = 丢弃（非阻塞），false = 阻塞等待
    drop_on_full: bool,
}

impl AudioTee {
    /// 创建新的 Tee
    pub fn new() -> Self {
        Self {
            consumers: Arc::new(RwLock::new(Vec::new())),
            running: Arc::new(AtomicBool::new(false)),
            drop_on_full: true,
        }
    }

    /// 创建带阻塞策略的 Tee
    pub fn with_blocking() -> Self {
        Self {
            consumers: Arc::new(RwLock::new(Vec::new())),
            running: Arc::new(AtomicBool::new(false)),
            drop_on_full: false,
        }
    }

    /// 添加消费者
    ///
    /// # Arguments
    /// * `buffer_size` - 消费者接收缓冲区大小
    ///
    /// # Returns
    /// (消费者 ID, 音频流接收端)
    pub async fn add_consumer(&self, buffer_size: usize) -> (usize, AudioStream) {
        let id = CONSUMER_ID_COUNTER.fetch_add(1, Ordering::SeqCst);
        let (sender, receiver) = create_audio_stream(buffer_size);

        let info = ConsumerInfo {
            id,
            sender,
            dropped_count: AtomicUsize::new(0),
        };

        self.consumers.write().await.push(info);

        tracing::debug!("Tee: 添加消费者 {}", id);
        (id, receiver)
    }

    /// 移除消费者
    pub async fn remove_consumer(&self, id: usize) {
        let mut consumers = self.consumers.write().await;
        if let Some(pos) = consumers.iter().position(|c| c.id == id) {
            let info = consumers.remove(pos);
            tracing::debug!(
                "Tee: 移除消费者 {} (丢弃: {} 个数据块)",
                id,
                info.dropped_count.load(Ordering::Relaxed)
            );
        }
    }

    /// 获取消费者数量
    pub async fn consumer_count(&self) -> usize {
        self.consumers.read().await.len()
    }

    /// 分发音频数据块给所有消费者
    pub async fn distribute(&self, chunk: AudioChunk) -> AudioResult<()> {
        let consumers = self.consumers.read().await;

        if consumers.is_empty() {
            return Ok(());
        }

        for consumer in consumers.iter() {
            if self.drop_on_full {
                // 非阻塞发送，满了就丢弃
                if consumer.sender.try_send(chunk.clone()).is_err() {
                    consumer.dropped_count.fetch_add(1, Ordering::Relaxed);
                }
            } else {
                // 阻塞发送
                let _ = consumer.sender.send(chunk.clone()).await;
            }
        }

        Ok(())
    }

    /// 分发音频数据块（同步版本）
    pub fn distribute_sync(&self, chunk: AudioChunk) -> AudioResult<()> {
        // 使用 try_read 避免阻塞
        if let Ok(consumers) = self.consumers.try_read() {
            for consumer in consumers.iter() {
                if consumer.sender.try_send(chunk.clone()).is_err() {
                    consumer.dropped_count.fetch_add(1, Ordering::Relaxed);
                }
            }
        }
        Ok(())
    }

    /// 运行 Tee 主循环
    ///
    /// 从输入流读取数据并分发给所有消费者
    pub async fn run(&self, mut input: AudioStream) {
        self.running.store(true, Ordering::SeqCst);

        tracing::info!("Tee: 开始运行");

        while self.running.load(Ordering::SeqCst) {
            match input.recv().await {
                Some(chunk) => {
                    if let Err(e) = self.distribute(chunk).await {
                        tracing::warn!("Tee: 分发失败: {}", e);
                    }
                }
                None => {
                    tracing::debug!("Tee: 输入流已关闭");
                    break;
                }
            }
        }

        self.running.store(false, Ordering::SeqCst);
        tracing::info!("Tee: 停止运行");
    }

    /// 停止 Tee
    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
    }

    /// 检查是否正在运行
    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    /// 获取所有消费者的丢弃统计
    pub async fn get_drop_stats(&self) -> Vec<(usize, usize)> {
        self.consumers
            .read()
            .await
            .iter()
            .map(|c| (c.id, c.dropped_count.load(Ordering::Relaxed)))
            .collect()
    }
}

impl Default for AudioTee {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// 测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_tee_add_remove_consumer() {
        let tee = AudioTee::new();

        assert_eq!(tee.consumer_count().await, 0);

        let (id1, _stream1) = tee.add_consumer(16).await;
        let (id2, _stream2) = tee.add_consumer(16).await;

        assert_eq!(tee.consumer_count().await, 2);

        tee.remove_consumer(id1).await;
        assert_eq!(tee.consumer_count().await, 1);

        tee.remove_consumer(id2).await;
        assert_eq!(tee.consumer_count().await, 0);
    }

    #[tokio::test]
    async fn test_tee_distribute() {
        let tee = AudioTee::new();

        let (_, mut stream1) = tee.add_consumer(16).await;
        let (_, mut stream2) = tee.add_consumer(16).await;

        let chunk = AudioChunk::new(vec![0.5, -0.5], 100, 48000, 2);
        tee.distribute(chunk.clone()).await.unwrap();

        // 两个消费者都应该收到数据
        let received1 = stream1.recv().await.unwrap();
        let received2 = stream2.recv().await.unwrap();

        assert_eq!(received1.samples, chunk.samples);
        assert_eq!(received2.samples, chunk.samples);
    }

    #[tokio::test]
    async fn test_tee_drop_on_full() {
        let tee = AudioTee::new();

        // 创建一个很小的缓冲区
        let (_id, _stream) = tee.add_consumer(2).await;

        // 发送超过缓冲区大小的数据
        for i in 0..10 {
            let chunk = AudioChunk::new(vec![i as f32], i as u64, 48000, 1);
            let _ = tee.distribute(chunk).await;
        }

        // 检查丢弃统计
        let stats = tee.get_drop_stats().await;
        assert!(!stats.is_empty());
        // 由于缓冲区只有 2，应该有一些数据被丢弃
        assert!(stats[0].1 > 0);
    }
}

