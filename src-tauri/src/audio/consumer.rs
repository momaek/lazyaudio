//! 音频消费者 trait 定义
//!
//! 定义音频管道中消费者的统一接口

use super::types::{AudioChunk, AudioResult};

/// 音频消费者接口
///
/// 所有音频处理组件都应实现此接口，以便在音频管道中使用
pub trait AudioConsumer: Send + Sync {
    /// 消费一个音频数据块
    ///
    /// # Arguments
    /// * `chunk` - 音频数据块
    ///
    /// # Returns
    /// 成功返回 Ok(()), 失败返回错误
    fn consume(&mut self, chunk: &AudioChunk) -> AudioResult<()>;

    /// 刷新缓冲区
    ///
    /// 强制处理所有缓冲的数据
    fn flush(&mut self) -> AudioResult<()>;

    /// 重置状态
    ///
    /// 清除所有内部状态，准备处理新的音频流
    fn reset(&mut self);

    /// 获取消费者名称（用于调试）
    fn name(&self) -> &str {
        "AudioConsumer"
    }
}

/// 异步音频消费者接口
#[allow(async_fn_in_trait)]
pub trait AsyncAudioConsumer: Send + Sync {
    /// 消费一个音频数据块
    async fn consume(&mut self, chunk: &AudioChunk) -> AudioResult<()>;

    /// 刷新缓冲区
    async fn flush(&mut self) -> AudioResult<()>;

    /// 重置状态
    fn reset(&mut self);

    /// 获取消费者名称
    fn name(&self) -> &str {
        "AsyncAudioConsumer"
    }
}

/// 可克隆的音频消费者工厂
///
/// 用于在 Tee 中动态创建消费者实例
pub trait AudioConsumerFactory: Send + Sync {
    /// 消费者类型
    type Consumer: AudioConsumer;

    /// 创建新的消费者实例
    fn create(&self) -> Self::Consumer;
}

