//! 音频采集接口定义
//!
//! 定义 `AudioCapture` trait，作为所有音频采集实现的统一接口

use super::types::{
    AudioCaptureConfig, AudioResult, AudioSource, AudioStream, CaptureState, CaptureStats,
};

/// 音频采集接口
///
/// 定义音频采集的统一接口，支持系统音频和麦克风采集
///
/// # 使用示例
///
/// ```ignore
/// let mut capture = MacOSSystemCapture::new()?;
/// let sources = capture.list_sources()?;
/// let stream = capture.start(config)?;
///
/// // 从 stream 读取音频数据
/// while let Some(chunk) = stream.recv().await {
///     // 处理音频数据
/// }
///
/// capture.stop()?;
/// ```
pub trait AudioCapture: Send {
    /// 获取可用的音频源列表
    ///
    /// # Returns
    /// 返回可用音频源列表
    fn list_sources(&self) -> AudioResult<Vec<AudioSource>>;

    /// 开始音频采集
    ///
    /// # Arguments
    /// * `source` - 音频源
    /// * `config` - 采集配置
    ///
    /// # Returns
    /// 返回音频流接收端
    fn start(&mut self, source: &AudioSource, config: &AudioCaptureConfig)
        -> AudioResult<AudioStream>;

    /// 停止音频采集
    fn stop(&mut self) -> AudioResult<()>;

    /// 暂停音频采集
    fn pause(&mut self) -> AudioResult<()>;

    /// 恢复音频采集
    fn resume(&mut self) -> AudioResult<()>;

    /// 获取当前采集状态
    fn state(&self) -> CaptureState;

    /// 获取采集统计信息
    fn stats(&self) -> CaptureStats;
}

/// 异步音频采集接口
///
/// 支持异步操作的音频采集接口
#[allow(async_fn_in_trait)]
pub trait AsyncAudioCapture: Send + Sync {
    /// 获取可用的音频源列表
    async fn list_sources(&self) -> AudioResult<Vec<AudioSource>>;

    /// 开始音频采集
    async fn start(
        &mut self,
        source: &AudioSource,
        config: &AudioCaptureConfig,
    ) -> AudioResult<AudioStream>;

    /// 停止音频采集
    async fn stop(&mut self) -> AudioResult<()>;

    /// 暂停音频采集
    async fn pause(&mut self) -> AudioResult<()>;

    /// 恢复音频采集
    async fn resume(&mut self) -> AudioResult<()>;

    /// 获取当前采集状态
    fn state(&self) -> CaptureState;

    /// 获取采集统计信息
    fn stats(&self) -> CaptureStats;
}

