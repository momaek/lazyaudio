//! 语音段落模块
//!
//! 定义语音段落结构和语音段落收集器

use std::collections::VecDeque;
use std::time::Duration;

use super::vad::{VadConfig, VadState, VoiceActivityDetector};

/// 语音段落
///
/// 表示一段连续的语音数据
#[derive(Debug, Clone)]
pub struct SpeechSegment {
    /// 段落开始时间（从录制开始计算）
    pub start_time: Duration,
    /// 段落结束时间（如果尚未结束则为 None）
    pub end_time: Option<Duration>,
    /// 音频采样数据（16kHz 单声道）
    pub samples: Vec<f32>,
    /// 段落是否已完成
    pub is_complete: bool,
    /// 段落 ID（递增）
    pub id: u64,
}

impl SpeechSegment {
    /// 创建新的语音段落
    pub fn new(start_time: Duration, id: u64) -> Self {
        Self {
            start_time,
            end_time: None,
            samples: Vec::new(),
            is_complete: false,
            id,
        }
    }

    /// 添加音频采样
    pub fn append_samples(&mut self, samples: &[f32]) {
        self.samples.extend_from_slice(samples);
    }

    /// 完成段落
    pub fn complete(&mut self, end_time: Duration) {
        self.end_time = Some(end_time);
        self.is_complete = true;
    }

    /// 获取段落时长
    pub fn duration(&self) -> Duration {
        if let Some(end) = self.end_time {
            end.saturating_sub(self.start_time)
        } else {
            // 根据采样数估算时长（假设 16kHz）
            Duration::from_secs_f64(self.samples.len() as f64 / 16000.0)
        }
    }

    /// 获取采样数
    pub fn sample_count(&self) -> usize {
        self.samples.len()
    }
}

/// 语音段落收集器配置
#[derive(Debug, Clone)]
pub struct SpeechCollectorConfig {
    /// VAD 配置
    pub vad_config: VadConfig,
    /// 最大段落时长（秒）- 超过后强制分段
    pub max_segment_duration_secs: f32,
    /// 最大待处理段落数
    pub max_pending_segments: usize,
    /// 采样率
    pub sample_rate: u32,
}

impl Default for SpeechCollectorConfig {
    fn default() -> Self {
        Self {
            vad_config: VadConfig::default(),
            max_segment_duration_secs: 30.0,
            max_pending_segments: 10,
            sample_rate: 16000,
        }
    }
}

/// 语音段落收集器
///
/// 使用 VAD 检测语音活动，收集并分段语音数据
pub struct SpeechCollector {
    /// VAD 检测器
    vad: VoiceActivityDetector,
    /// 配置
    config: SpeechCollectorConfig,
    /// 当前正在收集的段落
    current_segment: Option<SpeechSegment>,
    /// 已完成的段落队列
    completed_segments: VecDeque<SpeechSegment>,
    /// 段落 ID 计数器
    next_segment_id: u64,
    /// 当前时间戳（采样数）
    current_sample_offset: u64,
    /// 语音前的缓冲数据（用于保留语音开始前的一小段音频）
    pre_speech_buffer: VecDeque<f32>,
    /// 预缓冲采样数
    pre_buffer_samples: usize,
}

impl SpeechCollector {
    /// 创建新的语音段落收集器
    pub fn new(config: SpeechCollectorConfig) -> Self {
        let pre_buffer_samples =
            (config.vad_config.speech_pad_ms as f32 / 1000.0 * config.sample_rate as f32) as usize;

        Self {
            vad: VoiceActivityDetector::new(config.vad_config.clone()),
            config,
            current_segment: None,
            completed_segments: VecDeque::new(),
            next_segment_id: 0,
            current_sample_offset: 0,
            pre_speech_buffer: VecDeque::with_capacity(pre_buffer_samples),
            pre_buffer_samples,
        }
    }

    /// 处理音频采样
    ///
    /// # Arguments
    /// * `samples` - 16kHz 单声道音频采样
    ///
    /// # Returns
    /// 如果有新完成的段落，返回 Some(segment)
    pub fn process(&mut self, samples: &[f32]) -> Option<SpeechSegment> {
        // 更新 VAD
        let vad_state = self.vad.process(samples);

        // 更新预缓冲
        self.update_pre_buffer(samples);

        // 计算当前时间
        let current_time =
            Duration::from_secs_f64(self.current_sample_offset as f64 / self.config.sample_rate as f64);
        self.current_sample_offset += samples.len() as u64;

        // 根据 VAD 状态处理
        match vad_state {
            VadState::Speech => {
                // 开始或继续收集语音
                if self.current_segment.is_none() {
                    // 开始新段落
                    let mut segment = SpeechSegment::new(current_time, self.next_segment_id);
                    self.next_segment_id += 1;

                    // 添加预缓冲数据
                    let pre_buffer: Vec<f32> = self.pre_speech_buffer.iter().copied().collect();
                    segment.append_samples(&pre_buffer);

                    self.current_segment = Some(segment);
                }

                // 添加当前采样
                if let Some(ref mut segment) = self.current_segment {
                    segment.append_samples(samples);

                    // 检查是否超过最大时长
                    if segment.duration().as_secs_f32() > self.config.max_segment_duration_secs {
                        // 强制完成当前段落
                        segment.complete(current_time);
                        let completed = self.current_segment.take().unwrap();
                        return Some(completed);
                    }
                }

                None
            }
            VadState::SpeechEnd => {
                // 语音结束，完成当前段落
                if let Some(ref mut segment) = self.current_segment {
                    segment.append_samples(samples);
                    segment.complete(current_time);
                }

                self.current_segment.take()
            }
            VadState::Silence => {
                // 静音状态，不处理
                None
            }
        }
    }

    /// 强制完成当前段落
    ///
    /// 用于流结束时处理未完成的段落
    pub fn flush(&mut self) -> Option<SpeechSegment> {
        if let Some(ref mut segment) = self.current_segment {
            let current_time =
                Duration::from_secs_f64(self.current_sample_offset as f64 / self.config.sample_rate as f64);
            segment.complete(current_time);
        }
        self.current_segment.take()
    }

    /// 获取已完成段落
    pub fn pop_completed(&mut self) -> Option<SpeechSegment> {
        self.completed_segments.pop_front()
    }

    /// 获取已完成段落数量
    pub fn completed_count(&self) -> usize {
        self.completed_segments.len()
    }

    /// 检查是否有正在收集的段落
    pub fn is_collecting(&self) -> bool {
        self.current_segment.is_some()
    }

    /// 获取当前 VAD 状态
    pub fn vad_state(&self) -> VadState {
        self.vad.state()
    }

    /// 重置收集器状态
    pub fn reset(&mut self) {
        self.vad.reset();
        self.current_segment = None;
        self.completed_segments.clear();
        self.current_sample_offset = 0;
        self.pre_speech_buffer.clear();
    }

    /// 更新预缓冲
    fn update_pre_buffer(&mut self, samples: &[f32]) {
        for &sample in samples {
            if self.pre_speech_buffer.len() >= self.pre_buffer_samples {
                self.pre_speech_buffer.pop_front();
            }
            self.pre_speech_buffer.push_back(sample);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_speech_segment_creation() {
        let segment = SpeechSegment::new(Duration::from_secs(1), 0);
        assert_eq!(segment.id, 0);
        assert_eq!(segment.start_time, Duration::from_secs(1));
        assert!(segment.end_time.is_none());
        assert!(!segment.is_complete);
    }

    #[test]
    fn test_speech_segment_append() {
        let mut segment = SpeechSegment::new(Duration::ZERO, 0);
        segment.append_samples(&[0.1, 0.2, 0.3]);
        assert_eq!(segment.sample_count(), 3);
    }

    #[test]
    fn test_speech_segment_complete() {
        let mut segment = SpeechSegment::new(Duration::ZERO, 0);
        segment.append_samples(&[0.1; 16000]); // 1秒的数据
        segment.complete(Duration::from_secs(1));

        assert!(segment.is_complete);
        assert_eq!(segment.end_time, Some(Duration::from_secs(1)));
        assert_eq!(segment.duration(), Duration::from_secs(1));
    }

    #[test]
    fn test_speech_collector_creation() {
        let config = SpeechCollectorConfig::default();
        let collector = SpeechCollector::new(config);
        assert!(!collector.is_collecting());
        assert_eq!(collector.completed_count(), 0);
    }

    #[test]
    fn test_speech_collector_silence() {
        let config = SpeechCollectorConfig::default();
        let mut collector = SpeechCollector::new(config);

        // 处理静音数据
        let silence: Vec<f32> = vec![0.0; 480];
        let result = collector.process(&silence);

        assert!(result.is_none());
        assert!(!collector.is_collecting());
    }

    #[test]
    fn test_speech_collector_reset() {
        let config = SpeechCollectorConfig::default();
        let mut collector = SpeechCollector::new(config);

        // 处理一些数据
        let samples: Vec<f32> = vec![0.1; 480];
        collector.process(&samples);

        // 重置
        collector.reset();
        assert!(!collector.is_collecting());
        assert_eq!(collector.completed_count(), 0);
    }
}

