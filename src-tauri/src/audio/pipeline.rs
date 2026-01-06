//! 音频管道模块
//!
//! 整合音频采集、缓冲、分发和处理的完整管道

use super::capture::AudioCapture;
use super::consumer::AudioConsumer;
use super::level_meter::{LevelMeter, SharedLevel};
use super::limiter::{LimiterConfig, SoftLimiter};
use super::tee::AudioTee;
use super::types::{AudioCaptureConfig, AudioError, AudioResult, AudioSource, AudioSourceType, AudioStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::RwLock;

/// 管道状态
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PipelineState {
    /// 空闲
    Idle,
    /// 正在运行
    Running,
    /// 已暂停
    Paused,
    /// 已停止
    Stopped,
    /// 错误
    Error,
}

/// 音频管道
///
/// 整合音频采集、Tee 分发和消费者处理
pub struct AudioPipeline {
    /// 音频源
    source: Box<dyn AudioCapture + Send>,
    /// Tee 分发器
    tee: Arc<AudioTee>,
    /// 消费者列表
    consumers: Arc<RwLock<Vec<Box<dyn AudioConsumer>>>>,
    /// 共享音量电平
    level: SharedLevel,
    /// 管道状态
    state: Arc<RwLock<PipelineState>>,
    /// 运行标志
    running: Arc<AtomicBool>,
    /// 采集配置
    config: AudioCaptureConfig,
    /// 限幅器配置
    limiter_config: LimiterConfig,
    /// 当前音频源类型（用于判断是否需要限幅）
    current_source_type: Arc<RwLock<Option<AudioSourceType>>>,
}

impl AudioPipeline {
    /// 创建新的音频管道
    ///
    /// # Arguments
    /// * `source` - 音频采集源
    pub fn new(source: Box<dyn AudioCapture + Send>) -> Self {
        Self {
            source,
            tee: Arc::new(AudioTee::new()),
            consumers: Arc::new(RwLock::new(Vec::new())),
            level: SharedLevel::new(),
            state: Arc::new(RwLock::new(PipelineState::Idle)),
            running: Arc::new(AtomicBool::new(false)),
            config: AudioCaptureConfig::default(),
            limiter_config: LimiterConfig::default(),
            current_source_type: Arc::new(RwLock::new(None)),
        }
    }

    /// 设置采集配置
    pub fn with_config(mut self, config: AudioCaptureConfig) -> Self {
        self.config = config;
        self
    }

    /// 设置限幅器配置
    pub fn with_limiter_config(mut self, config: LimiterConfig) -> Self {
        self.limiter_config = config;
        self
    }

    /// 启用或禁用限幅器
    pub fn set_limiter_enabled(&mut self, enabled: bool) {
        self.limiter_config.enabled = enabled;
    }

    /// 添加消费者
    ///
    /// 消费者将接收所有通过管道的音频数据
    pub async fn add_consumer(&self, consumer: Box<dyn AudioConsumer>) {
        self.consumers.write().await.push(consumer);
    }

    /// 添加 Tee 输出流
    ///
    /// 返回一个可以接收音频数据的流
    pub async fn add_output_stream(&self, buffer_size: usize) -> (usize, AudioStream) {
        self.tee.add_consumer(buffer_size).await
    }

    /// 移除 Tee 输出流
    pub async fn remove_output_stream(&self, id: usize) {
        self.tee.remove_consumer(id).await;
    }

    /// 获取共享音量电平
    pub fn level(&self) -> SharedLevel {
        self.level.clone()
    }

    /// 获取当前状态
    pub async fn state(&self) -> PipelineState {
        *self.state.read().await
    }

    /// 启动管道
    ///
    /// # Arguments
    /// * `audio_source` - 要采集的音频源
    pub async fn start(&mut self, audio_source: &AudioSource) -> AudioResult<()> {
        // 检查状态
        {
            let state = self.state.read().await;
            if *state == PipelineState::Running {
                return Err(AudioError::Other("管道已在运行中".to_string()));
            }
        }

        tracing::info!("启动音频管道: {}", audio_source.name);

        // 保存当前音频源类型
        *self.current_source_type.write().await = Some(audio_source.source_type.clone());

        // 启动音频采集
        let audio_stream = self.source.start(audio_source, &self.config)?;

        // 更新状态
        *self.state.write().await = PipelineState::Running;
        self.running.store(true, Ordering::SeqCst);

        // 判断是否需要限幅（系统音频和应用音频需要，麦克风不需要）
        let needs_limiter = matches!(
            audio_source.source_type,
            AudioSourceType::SystemAudio | AudioSourceType::Application { .. }
        );
        let limiter_config = if needs_limiter {
            self.limiter_config.clone()
        } else {
            LimiterConfig {
                enabled: false,
                ..self.limiter_config.clone()
            }
        };

        // 启动处理循环
        let tee = self.tee.clone();
        let consumers = self.consumers.clone();
        let level = self.level.clone();
        let running = self.running.clone();
        let state = self.state.clone();

        tokio::spawn(async move {
            Self::process_loop(audio_stream, tee, consumers, level, running, state, limiter_config).await;
        });

        Ok(())
    }

    /// 处理循环
    async fn process_loop(
        mut input: AudioStream,
        tee: Arc<AudioTee>,
        consumers: Arc<RwLock<Vec<Box<dyn AudioConsumer>>>>,
        level: SharedLevel,
        running: Arc<AtomicBool>,
        state: Arc<RwLock<PipelineState>>,
        limiter_config: LimiterConfig,
    ) {
        let mut level_meter = LevelMeter::new(4096);
        let mut limiter = SoftLimiter::new(limiter_config.clone());
        let mut log_counter: u64 = 0;

        if limiter_config.enabled {
            tracing::info!("音频管道启用软限幅器: threshold={}, ceiling={}", 
                limiter_config.threshold, limiter_config.ceiling);
        }

        while running.load(Ordering::SeqCst) {
            match input.recv().await {
                Some(chunk) => {
                    // 应用软限幅器（防止系统音频削波）
                    let processed_chunk = if limiter_config.enabled {
                        limiter.process(&chunk)
                    } else {
                        chunk
                    };

                    // 更新音量电平
                    level_meter.push_samples(&processed_chunk.samples);
                    level.set_level(level_meter.get_smoothed_level());
                    level.set_peak(level_meter.get_peak());

                    // 分发给 Tee 消费者
                    let _ = tee.distribute(processed_chunk.clone()).await;

                    // 处理同步消费者
                    let mut consumers_guard = consumers.write().await;
                    for consumer in consumers_guard.iter_mut() {
                        if let Err(e) = consumer.consume(&processed_chunk) {
                            tracing::warn!("消费者 {} 处理失败: {}", consumer.name(), e);
                        }
                    }

                    // 定期输出限幅器统计（每 10 秒）
                    log_counter += 1;
                    if limiter_config.enabled && log_counter % 500 == 0 {
                        let stats = limiter.stats();
                        if stats.limiting_ratio > 0.0 {
                            tracing::debug!(
                                "限幅器统计: 限幅比例={:.2}%, 最大输入值={:.3}",
                                stats.limiting_ratio * 100.0,
                                stats.max_input_value
                            );
                        }
                    }
                }
                None => {
                    tracing::debug!("音频流已关闭");
                    break;
                }
            }
        }

        // 输出最终限幅器统计
        if limiter_config.enabled {
            let stats = limiter.stats();
            tracing::info!(
                "音频管道停止 - 限幅器统计: 处理采样数={}, 限幅比例={:.2}%, 最大输入值={:.3}",
                stats.samples_processed,
                stats.limiting_ratio * 100.0,
                stats.max_input_value
            );
        }

        // 刷新所有消费者
        let mut consumers_guard = consumers.write().await;
        for consumer in consumers_guard.iter_mut() {
            if let Err(e) = consumer.flush() {
                tracing::warn!("消费者 {} 刷新失败: {}", consumer.name(), e);
            }
        }

        *state.write().await = PipelineState::Stopped;
        tracing::info!("音频管道处理循环结束");
    }

    /// 停止管道
    pub async fn stop(&mut self) -> AudioResult<()> {
        tracing::info!("停止音频管道");

        self.running.store(false, Ordering::SeqCst);
        self.source.stop()?;

        *self.state.write().await = PipelineState::Stopped;

        // 重置所有消费者
        let mut consumers = self.consumers.write().await;
        for consumer in consumers.iter_mut() {
            consumer.reset();
        }

        Ok(())
    }

    /// 暂停管道
    pub async fn pause(&mut self) -> AudioResult<()> {
        let current_state = *self.state.read().await;
        if current_state != PipelineState::Running {
            return Err(AudioError::Other("管道未在运行".to_string()));
        }

        tracing::info!("暂停音频管道");

        self.source.pause()?;
        *self.state.write().await = PipelineState::Paused;

        Ok(())
    }

    /// 恢复管道
    pub async fn resume(&mut self) -> AudioResult<()> {
        let current_state = *self.state.read().await;
        if current_state != PipelineState::Paused {
            return Err(AudioError::Other("管道未暂停".to_string()));
        }

        tracing::info!("恢复音频管道");

        self.source.resume()?;
        *self.state.write().await = PipelineState::Running;

        Ok(())
    }

    /// 获取当前音量级别（0.0-1.0）
    pub fn get_level(&self) -> f32 {
        self.level.get_level()
    }

    /// 获取当前峰值（0.0-1.0）
    pub fn get_peak(&self) -> f32 {
        self.level.get_peak()
    }

    /// 检查是否正在运行
    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }
}

// ============================================================================
// 管道构建器
// ============================================================================

/// 音频管道构建器
pub struct AudioPipelineBuilder {
    source: Option<Box<dyn AudioCapture + Send>>,
    config: AudioCaptureConfig,
    limiter_config: LimiterConfig,
}

impl AudioPipelineBuilder {
    /// 创建新的构建器
    pub fn new() -> Self {
        Self {
            source: None,
            config: AudioCaptureConfig::default(),
            limiter_config: LimiterConfig::default(),
        }
    }

    /// 设置音频源
    pub fn source(mut self, source: Box<dyn AudioCapture + Send>) -> Self {
        self.source = Some(source);
        self
    }

    /// 设置采集配置
    pub fn config(mut self, config: AudioCaptureConfig) -> Self {
        self.config = config;
        self
    }

    /// 设置限幅器配置
    pub fn limiter_config(mut self, config: LimiterConfig) -> Self {
        self.limiter_config = config;
        self
    }

    /// 构建管道
    pub fn build(self) -> AudioResult<AudioPipeline> {
        let source = self
            .source
            .ok_or_else(|| AudioError::ConfigError("未设置音频源".to_string()))?;

        Ok(AudioPipeline::new(source)
            .with_config(self.config)
            .with_limiter_config(self.limiter_config))
    }
}

impl Default for AudioPipelineBuilder {
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
    use crate::audio::CaptureState;

    // 模拟音频源用于测试
    struct MockAudioCapture {
        state: CaptureState,
    }

    impl MockAudioCapture {
        fn new() -> Self {
            Self {
                state: CaptureState::Idle,
            }
        }
    }

    impl AudioCapture for MockAudioCapture {
        fn list_sources(&self) -> AudioResult<Vec<AudioSource>> {
            Ok(vec![AudioSource::system_audio()])
        }

        fn start(
            &mut self,
            _source: &AudioSource,
            _config: &AudioCaptureConfig,
        ) -> AudioResult<AudioStream> {
            self.state = CaptureState::Running;
            let (_, receiver) = super::super::types::create_audio_stream(16);
            Ok(receiver)
        }

        fn stop(&mut self) -> AudioResult<()> {
            self.state = CaptureState::Stopped;
            Ok(())
        }

        fn pause(&mut self) -> AudioResult<()> {
            self.state = CaptureState::Paused;
            Ok(())
        }

        fn resume(&mut self) -> AudioResult<()> {
            self.state = CaptureState::Running;
            Ok(())
        }

        fn state(&self) -> CaptureState {
            self.state
        }

        fn stats(&self) -> super::super::types::CaptureStats {
            super::super::types::CaptureStats::default()
        }
    }

    #[test]
    fn test_pipeline_builder() {
        let source = MockAudioCapture::new();
        let pipeline = AudioPipelineBuilder::new()
            .source(Box::new(source))
            .build();

        assert!(pipeline.is_ok());
    }

    #[test]
    fn test_pipeline_builder_no_source() {
        let pipeline = AudioPipelineBuilder::new().build();
        assert!(pipeline.is_err());
    }

    #[tokio::test]
    async fn test_pipeline_state() {
        let source = MockAudioCapture::new();
        let pipeline = AudioPipelineBuilder::new()
            .source(Box::new(source))
            .build()
            .unwrap();

        assert_eq!(pipeline.state().await, PipelineState::Idle);
        assert!(!pipeline.is_running());
    }
}

