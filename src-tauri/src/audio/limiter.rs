//! 软限幅器模块
//!
//! 防止音频削波（Clipping），将超出 ±1.0 范围的音频信号
//! 平滑压缩到安全范围内。
//!
//! ## 问题背景
//!
//! macOS 的 Process Tap API 捕获的系统音频可能超过 ±1.0 范围，
//! 因为多应用混音叠加或 CoreAudio 内部处理链的中间值可能超标。
//!
//! ## 限幅算法
//!
//! 使用软限幅（Soft Limiter）而非硬削波（Hard Clipping）：
//! - 在阈值以下：信号不变
//! - 在阈值以上：使用 tanh 曲线平滑压缩
//!
//! 这样可以保持音质，避免产生刺耳的削波失真。

use super::types::AudioChunk;

/// 软限幅器配置
#[derive(Debug, Clone)]
pub struct LimiterConfig {
    /// 启用限幅器
    pub enabled: bool,
    /// 阈值（0.0-1.0），超过此值开始压缩，默认 0.9
    pub threshold: f32,
    /// 输出上限（0.0-1.0），压缩后的最大值，默认 0.99
    pub ceiling: f32,
    /// 软拐点系数（knee），值越大过渡越平滑，默认 0.5
    pub knee: f32,
}

impl Default for LimiterConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            threshold: 0.9,
            ceiling: 0.99,
            knee: 0.5,
        }
    }
}

/// 软限幅器
///
/// 将音频信号限制在安全范围内，防止削波失真
pub struct SoftLimiter {
    config: LimiterConfig,
    /// 统计：处理的采样数
    samples_processed: u64,
    /// 统计：被限幅的采样数
    samples_limited: u64,
    /// 统计：最大输入值
    max_input_value: f32,
}

impl SoftLimiter {
    /// 创建新的软限幅器
    pub fn new(config: LimiterConfig) -> Self {
        Self {
            config,
            samples_processed: 0,
            samples_limited: 0,
            max_input_value: 0.0,
        }
    }

    /// 使用默认配置创建
    pub fn with_defaults() -> Self {
        Self::new(LimiterConfig::default())
    }

    /// 处理音频数据块
    ///
    /// 返回限幅后的新 AudioChunk
    pub fn process(&mut self, chunk: &AudioChunk) -> AudioChunk {
        if !self.config.enabled {
            return chunk.clone();
        }

        let mut limited_samples = Vec::with_capacity(chunk.samples.len());

        for &sample in &chunk.samples {
            let abs_val = sample.abs();
            
            // 更新统计
            self.samples_processed += 1;
            if abs_val > self.max_input_value {
                self.max_input_value = abs_val;
            }

            let limited = if abs_val <= self.config.threshold {
                // 阈值以下：不变
                sample
            } else {
                // 阈值以上：软限幅
                self.samples_limited += 1;
                self.soft_limit(sample)
            };

            limited_samples.push(limited);
        }

        AudioChunk::new(
            limited_samples,
            chunk.timestamp_ms,
            chunk.sample_rate,
            chunk.channels,
        )
    }

    /// 软限幅算法
    ///
    /// 使用 tanh 曲线实现平滑压缩
    fn soft_limit(&self, sample: f32) -> f32 {
        let sign = sample.signum();
        let abs_val = sample.abs();
        let threshold = self.config.threshold;
        let ceiling = self.config.ceiling;
        let knee = self.config.knee;

        // 超出阈值的部分
        let excess = abs_val - threshold;
        
        // 使用 tanh 压缩超出部分
        // tanh 的范围是 (-1, 1)，我们映射到 (0, ceiling - threshold)
        let compressed_excess = (excess * knee).tanh() * (ceiling - threshold);
        
        // 最终值 = 阈值 + 压缩后的超出部分
        sign * (threshold + compressed_excess)
    }

    /// 原地处理音频数据
    ///
    /// 直接修改传入的采样数据
    pub fn process_in_place(&mut self, samples: &mut [f32]) {
        if !self.config.enabled {
            return;
        }

        for sample in samples.iter_mut() {
            let abs_val = sample.abs();
            
            self.samples_processed += 1;
            if abs_val > self.max_input_value {
                self.max_input_value = abs_val;
            }

            if abs_val > self.config.threshold {
                self.samples_limited += 1;
                *sample = self.soft_limit(*sample);
            }
        }
    }

    /// 获取限幅比例（被限幅的采样占比）
    pub fn limiting_ratio(&self) -> f64 {
        if self.samples_processed == 0 {
            0.0
        } else {
            self.samples_limited as f64 / self.samples_processed as f64
        }
    }

    /// 获取最大输入值
    pub fn max_input_value(&self) -> f32 {
        self.max_input_value
    }

    /// 获取统计信息
    pub fn stats(&self) -> LimiterStats {
        LimiterStats {
            samples_processed: self.samples_processed,
            samples_limited: self.samples_limited,
            limiting_ratio: self.limiting_ratio(),
            max_input_value: self.max_input_value,
        }
    }

    /// 重置统计信息
    pub fn reset_stats(&mut self) {
        self.samples_processed = 0;
        self.samples_limited = 0;
        self.max_input_value = 0.0;
    }

    /// 设置是否启用
    pub fn set_enabled(&mut self, enabled: bool) {
        self.config.enabled = enabled;
    }

    /// 是否启用
    pub fn is_enabled(&self) -> bool {
        self.config.enabled
    }
}

/// 限幅器统计信息
#[derive(Debug, Clone)]
pub struct LimiterStats {
    /// 处理的采样数
    pub samples_processed: u64,
    /// 被限幅的采样数
    pub samples_limited: u64,
    /// 限幅比例
    pub limiting_ratio: f64,
    /// 最大输入值
    pub max_input_value: f32,
}

// ============================================================================
// 便捷函数
// ============================================================================

/// 对音频数据块应用软限幅
///
/// 使用默认配置，适用于一次性处理
pub fn apply_soft_limiter(chunk: &AudioChunk) -> AudioChunk {
    let mut limiter = SoftLimiter::with_defaults();
    limiter.process(chunk)
}

/// 对采样数据原地应用软限幅
///
/// 使用默认配置，直接修改传入的数据
pub fn apply_soft_limiter_in_place(samples: &mut [f32]) {
    let mut limiter = SoftLimiter::with_defaults();
    limiter.process_in_place(samples);
}

// ============================================================================
// 测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_soft_limiter_below_threshold() {
        let mut limiter = SoftLimiter::with_defaults();
        let samples = vec![0.1, -0.2, 0.5, -0.8];
        let chunk = AudioChunk::new(samples.clone(), 0, 48000, 2);
        
        let result = limiter.process(&chunk);
        
        // 阈值以下应该不变
        for (orig, limited) in samples.iter().zip(result.samples.iter()) {
            assert!((orig - limited).abs() < 0.0001);
        }
        assert_eq!(limiter.samples_limited, 0);
    }

    #[test]
    fn test_soft_limiter_above_threshold() {
        let mut limiter = SoftLimiter::new(LimiterConfig {
            enabled: true,
            threshold: 0.9,
            ceiling: 0.99,
            knee: 0.5,
        });
        
        // 测试超出范围的值
        let samples = vec![1.2, -1.5, 0.95, -1.0];
        let chunk = AudioChunk::new(samples, 0, 48000, 2);
        
        let result = limiter.process(&chunk);
        
        // 所有值应该在 ceiling 范围内
        for sample in &result.samples {
            assert!(sample.abs() <= limiter.config.ceiling + 0.001);
        }
        
        // 应该有采样被限幅
        assert!(limiter.samples_limited > 0);
    }

    #[test]
    fn test_soft_limiter_preserves_sign() {
        let mut limiter = SoftLimiter::with_defaults();
        let samples = vec![1.5, -1.5];
        let chunk = AudioChunk::new(samples, 0, 48000, 2);
        
        let result = limiter.process(&chunk);
        
        // 符号应该保持
        assert!(result.samples[0] > 0.0);
        assert!(result.samples[1] < 0.0);
    }

    #[test]
    fn test_soft_limiter_disabled() {
        let mut limiter = SoftLimiter::new(LimiterConfig {
            enabled: false,
            ..Default::default()
        });
        
        let samples = vec![1.5, -1.5];
        let chunk = AudioChunk::new(samples.clone(), 0, 48000, 2);
        
        let result = limiter.process(&chunk);
        
        // 禁用时应该不变
        assert_eq!(result.samples, samples);
    }

    #[test]
    fn test_soft_limiter_in_place() {
        let mut samples = vec![1.2, -1.5, 0.5, -0.8];
        apply_soft_limiter_in_place(&mut samples);
        
        // 检查结果在范围内
        for sample in &samples {
            assert!(sample.abs() <= 1.0);
        }
    }

    #[test]
    fn test_limiter_stats() {
        let mut limiter = SoftLimiter::with_defaults();
        let samples = vec![0.5, 1.2, -1.5, 0.3];
        let chunk = AudioChunk::new(samples, 0, 48000, 2);
        
        limiter.process(&chunk);
        
        let stats = limiter.stats();
        assert_eq!(stats.samples_processed, 4);
        assert_eq!(stats.samples_limited, 2); // 1.2 和 -1.5
        assert!((stats.max_input_value - 1.5).abs() < 0.001);
    }
}

