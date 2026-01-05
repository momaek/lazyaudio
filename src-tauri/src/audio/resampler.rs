//! 重采样模块
//!
//! 使用线性插值实现简单重采样，主要用于将 48kHz 转换为 16kHz（ASR 输入）
//!
//! 注意：这是一个简化实现，对于高质量需求可考虑使用更复杂的算法

use super::consumer::AudioConsumer;
use super::types::{AudioChunk, AudioError, AudioResult};
use std::sync::{Arc, Mutex};

/// 重采样器
///
/// 将音频从源采样率转换为目标采样率
pub struct Resampler {
    /// 源采样率
    input_rate: u32,
    /// 目标采样率
    output_rate: u32,
    /// 通道数
    channels: usize,
    /// 重采样比例
    ratio: f64,
    /// 待处理的采样缓存（交错格式）
    pending_samples: Vec<f32>,
    /// 位置累积（用于插值）
    position: f64,
}

impl Resampler {
    /// 创建新的重采样器
    ///
    /// # Arguments
    /// * `input_rate` - 源采样率（如 48000）
    /// * `output_rate` - 目标采样率（如 16000）
    /// * `channels` - 通道数
    ///
    /// # Returns
    /// 新的重采样器实例
    pub fn new(input_rate: u32, output_rate: u32, channels: usize) -> AudioResult<Self> {
        if input_rate == 0 || output_rate == 0 || channels == 0 {
            return Err(AudioError::ConfigError(
                "无效的重采样器参数".to_string(),
            ));
        }

        let ratio = output_rate as f64 / input_rate as f64;

        Ok(Self {
            input_rate,
            output_rate,
            channels,
            ratio,
            pending_samples: Vec::new(),
            position: 0.0,
        })
    }

    /// 创建 48kHz → 16kHz 的重采样器（用于 ASR）
    pub fn new_for_asr(channels: usize) -> AudioResult<Self> {
        Self::new(48000, 16000, channels)
    }

    /// 处理音频数据
    ///
    /// # Arguments
    /// * `input` - 交错格式的输入采样
    ///
    /// # Returns
    /// 交错格式的输出采样
    pub fn process(&mut self, input: &[f32]) -> AudioResult<Vec<f32>> {
        // 添加到待处理缓存
        self.pending_samples.extend_from_slice(input);

        let frames_available = self.pending_samples.len() / self.channels;
        if frames_available < 2 {
            return Ok(Vec::new());
        }

        let mut output = Vec::new();
        let step = 1.0 / self.ratio;

        while self.position < (frames_available - 1) as f64 {
            let pos = self.position;
            let index = pos.floor() as usize;
            let frac = pos - index as f64;

            // 对每个通道进行线性插值
            for ch in 0..self.channels {
                let idx0 = index * self.channels + ch;
                let idx1 = (index + 1) * self.channels + ch;

                if idx1 < self.pending_samples.len() {
                    let sample0 = self.pending_samples[idx0];
                    let sample1 = self.pending_samples[idx1];
                    let interpolated = sample0 + (sample1 - sample0) * frac as f32;
                    output.push(interpolated);
                }
            }

            self.position += step;
        }

        // 移除已处理的帧
        let frames_consumed = self.position.floor() as usize;
        if frames_consumed > 0 {
            let samples_to_remove = frames_consumed * self.channels;
            if samples_to_remove <= self.pending_samples.len() {
                self.pending_samples.drain(..samples_to_remove);
                self.position -= frames_consumed as f64;
            }
        }

        Ok(output)
    }

    /// 刷新剩余数据
    pub fn flush(&mut self) -> AudioResult<Vec<f32>> {
        // 处理剩余的待处理数据
        let result = self.process(&[])?;
        self.pending_samples.clear();
        self.position = 0.0;
        Ok(result)
    }

    /// 获取源采样率
    pub fn input_rate(&self) -> u32 {
        self.input_rate
    }

    /// 获取目标采样率
    pub fn output_rate(&self) -> u32 {
        self.output_rate
    }

    /// 获取通道数
    pub fn channels(&self) -> usize {
        self.channels
    }

    /// 重置内部状态
    pub fn reset(&mut self) {
        self.pending_samples.clear();
        self.position = 0.0;
    }

    /// 获取延迟（采样数）- 线性插值几乎无延迟
    pub fn latency(&self) -> usize {
        1
    }
}

/// 带输出回调的重采样消费者（线程安全版本）
///
/// 处理后的数据通过回调函数输出
pub struct ResamplerConsumer {
    resampler: Resampler,
    /// 输出回调（线程安全）
    on_output: Arc<Mutex<Box<dyn FnMut(AudioChunk) + Send>>>,
}

impl ResamplerConsumer {
    /// 创建新的重采样消费者
    pub fn new<F>(resampler: Resampler, on_output: F) -> Self
    where
        F: FnMut(AudioChunk) + Send + 'static,
    {
        Self {
            resampler,
            on_output: Arc::new(Mutex::new(Box::new(on_output))),
        }
    }
}

// 为 ResamplerConsumer 实现 Send + Sync
unsafe impl Sync for ResamplerConsumer {}

impl AudioConsumer for ResamplerConsumer {
    fn consume(&mut self, chunk: &AudioChunk) -> AudioResult<()> {
        let resampled = self.resampler.process(&chunk.samples)?;

        if !resampled.is_empty() {
            let output_chunk = AudioChunk::new(
                resampled,
                chunk.timestamp_ms,
                self.resampler.output_rate(),
                self.resampler.channels() as u16,
            );

            if let Ok(mut callback) = self.on_output.lock() {
                (callback)(output_chunk);
            }
        }

        Ok(())
    }

    fn flush(&mut self) -> AudioResult<()> {
        let remaining = self.resampler.flush()?;
        if !remaining.is_empty() {
            let output_chunk = AudioChunk::new(
                remaining,
                0,
                self.resampler.output_rate(),
                self.resampler.channels() as u16,
            );
            if let Ok(mut callback) = self.on_output.lock() {
                (callback)(output_chunk);
            }
        }
        Ok(())
    }

    fn reset(&mut self) {
        self.resampler.reset();
    }

    fn name(&self) -> &str {
        "ResamplerConsumer"
    }
}

// ============================================================================
// 测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resampler_creation() {
        let resampler = Resampler::new(48000, 16000, 2);
        assert!(resampler.is_ok());

        let resampler = resampler.unwrap();
        assert_eq!(resampler.input_rate(), 48000);
        assert_eq!(resampler.output_rate(), 16000);
        assert_eq!(resampler.channels(), 2);
    }

    #[test]
    fn test_resampler_for_asr() {
        let resampler = Resampler::new_for_asr(1);
        assert!(resampler.is_ok());

        let resampler = resampler.unwrap();
        assert_eq!(resampler.input_rate(), 48000);
        assert_eq!(resampler.output_rate(), 16000);
    }

    #[test]
    fn test_resampler_process() {
        let mut resampler = Resampler::new(48000, 16000, 1).unwrap();

        // 生成测试数据（需要足够多的数据才能产生输出）
        let input: Vec<f32> = (0..4096).map(|i| (i as f32 / 100.0).sin()).collect();

        let output = resampler.process(&input).unwrap();

        // 输出采样数应该大约是输入的 1/3（16000/48000）
        // 但由于缓冲，可能不是精确的比例
        assert!(!output.is_empty());
    }

    #[test]
    fn test_resampler_stereo() {
        let mut resampler = Resampler::new(48000, 16000, 2).unwrap();

        // 生成立体声测试数据（交错格式）
        let mut input = Vec::new();
        for i in 0..2048 {
            input.push((i as f32 / 100.0).sin()); // Left
            input.push((i as f32 / 50.0).cos()); // Right
        }

        let output = resampler.process(&input).unwrap();

        // 输出应该是偶数个采样（立体声）
        assert!(output.len() % 2 == 0);
    }

    #[test]
    fn test_resampler_reset() {
        let mut resampler = Resampler::new(48000, 16000, 1).unwrap();

        let input: Vec<f32> = (0..1000).map(|i| (i as f32 / 100.0).sin()).collect();
        let _ = resampler.process(&input);

        resampler.reset();
        // 重置后应该能正常处理新数据
        let result = resampler.process(&input);
        assert!(result.is_ok());
    }
}

