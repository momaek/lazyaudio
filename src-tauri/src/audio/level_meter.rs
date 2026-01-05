//! 音量电平检测模块
//!
//! 提供实时音量电平检测，包括 RMS 和峰值测量

use std::collections::VecDeque;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

/// 音量电平检测器
///
/// 使用滑动窗口计算 RMS 音量和峰值
pub struct LevelMeter {
    /// 采样窗口（存储最近的采样平方值）
    window: VecDeque<f32>,
    /// 窗口大小（采样数）
    window_size: usize,
    /// 当前 RMS 平方和
    sum_squared: f32,
    /// 当前峰值
    peak: f32,
    /// 峰值衰减系数（每次更新衰减的比例）
    peak_decay: f32,
    /// 平滑系数（0-1，越大越平滑）
    smoothing: f32,
    /// 上一次的平滑 RMS 值
    smoothed_rms: f32,
}

impl LevelMeter {
    /// 创建新的音量电平检测器
    ///
    /// # Arguments
    /// * `window_size` - 滑动窗口大小（采样数），推荐 2048-4096
    pub fn new(window_size: usize) -> Self {
        Self {
            window: VecDeque::with_capacity(window_size),
            window_size,
            sum_squared: 0.0,
            peak: 0.0,
            peak_decay: 0.9995, // 慢速衰减
            smoothing: 0.3,     // 适度平滑
            smoothed_rms: 0.0,
        }
    }

    /// 创建带自定义参数的检测器
    pub fn with_params(window_size: usize, peak_decay: f32, smoothing: f32) -> Self {
        Self {
            window: VecDeque::with_capacity(window_size),
            window_size,
            sum_squared: 0.0,
            peak: 0.0,
            peak_decay,
            smoothing,
            smoothed_rms: 0.0,
        }
    }

    /// 处理采样数据
    ///
    /// # Arguments
    /// * `samples` - f32 采样数据
    pub fn push_samples(&mut self, samples: &[f32]) {
        for &sample in samples {
            let squared = sample * sample;

            // 更新峰值（带衰减）
            let abs_sample = sample.abs();
            if abs_sample > self.peak {
                self.peak = abs_sample;
            } else {
                self.peak *= self.peak_decay;
            }

            // 添加到窗口
            if self.window.len() >= self.window_size {
                // 移除最旧的值
                if let Some(old) = self.window.pop_front() {
                    self.sum_squared -= old;
                }
            }

            self.window.push_back(squared);
            self.sum_squared += squared;
        }

        // 更新平滑 RMS
        let current_rms = self.get_rms();
        self.smoothed_rms = self.smoothing * self.smoothed_rms + (1.0 - self.smoothing) * current_rms;
    }

    /// 获取当前 RMS 值（线性，0.0-1.0）
    pub fn get_rms(&self) -> f32 {
        if self.window.is_empty() {
            return 0.0;
        }
        (self.sum_squared / self.window.len() as f32).sqrt()
    }

    /// 获取平滑后的 RMS 值（线性，0.0-1.0）
    pub fn get_smoothed_rms(&self) -> f32 {
        self.smoothed_rms
    }

    /// 获取归一化音量级别（0.0-1.0）
    ///
    /// 将 dB 值映射到 0-1 范围，-60dB 映射到 0，0dB 映射到 1
    pub fn get_level(&self) -> f32 {
        let db = self.get_db();
        ((db + 60.0) / 60.0).clamp(0.0, 1.0)
    }

    /// 获取平滑后的归一化音量级别（0.0-1.0）
    pub fn get_smoothed_level(&self) -> f32 {
        let db = self.get_smoothed_db();
        ((db + 60.0) / 60.0).clamp(0.0, 1.0)
    }

    /// 获取当前 dB 值
    pub fn get_db(&self) -> f32 {
        let rms = self.get_rms();
        if rms > 0.0 {
            20.0 * rms.log10()
        } else {
            -100.0
        }
    }

    /// 获取平滑后的 dB 值
    pub fn get_smoothed_db(&self) -> f32 {
        if self.smoothed_rms > 0.0 {
            20.0 * self.smoothed_rms.log10()
        } else {
            -100.0
        }
    }

    /// 获取当前峰值（线性，0.0-1.0）
    pub fn get_peak(&self) -> f32 {
        self.peak
    }

    /// 获取峰值 dB 值
    pub fn get_peak_db(&self) -> f32 {
        if self.peak > 0.0 {
            20.0 * self.peak.log10()
        } else {
            -100.0
        }
    }

    /// 重置所有状态
    pub fn reset(&mut self) {
        self.window.clear();
        self.sum_squared = 0.0;
        self.peak = 0.0;
        self.smoothed_rms = 0.0;
    }
}

// LevelMeter 不实现 AudioConsumer，因为它需要同步访问
// 使用 SharedLevel 进行线程间通信

// ============================================================================
// 共享音量电平
// ============================================================================

/// 共享音量电平（线程安全）
///
/// 用于在线程间共享音量信息
#[derive(Clone, Debug)]
pub struct SharedLevel {
    /// 音量级别（0-10000 映射到 0.0-1.0）
    level: Arc<AtomicU32>,
    /// 峰值级别
    peak: Arc<AtomicU32>,
}

impl SharedLevel {
    /// 创建新的共享音量
    pub fn new() -> Self {
        Self {
            level: Arc::new(AtomicU32::new(0)),
            peak: Arc::new(AtomicU32::new(0)),
        }
    }

    /// 更新音量级别
    pub fn set_level(&self, level: f32) {
        let value = (level.clamp(0.0, 1.0) * 10000.0) as u32;
        self.level.store(value, Ordering::Relaxed);
    }

    /// 更新峰值级别
    pub fn set_peak(&self, peak: f32) {
        let value = (peak.clamp(0.0, 1.0) * 10000.0) as u32;
        self.peak.store(value, Ordering::Relaxed);
    }

    /// 获取音量级别
    pub fn get_level(&self) -> f32 {
        self.level.load(Ordering::Relaxed) as f32 / 10000.0
    }

    /// 获取峰值级别
    pub fn get_peak(&self) -> f32 {
        self.peak.load(Ordering::Relaxed) as f32 / 10000.0
    }
}

impl Default for SharedLevel {
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

    #[test]
    fn test_level_meter_silence() {
        let mut meter = LevelMeter::new(1024);

        // 静音
        let silence = vec![0.0f32; 1000];
        meter.push_samples(&silence);

        assert_eq!(meter.get_rms(), 0.0);
        assert!(meter.get_db() < -90.0);
        assert_eq!(meter.get_level(), 0.0);
    }

    #[test]
    fn test_level_meter_sine_wave() {
        let mut meter = LevelMeter::new(2048);

        // 生成正弦波 (振幅 0.5)
        let samples: Vec<f32> = (0..2000)
            .map(|i| 0.5 * (2.0 * std::f32::consts::PI * i as f32 / 100.0).sin())
            .collect();

        meter.push_samples(&samples);

        // 正弦波 RMS = 振幅 / sqrt(2)
        let expected_rms = 0.5 / std::f32::consts::SQRT_2;
        let actual_rms = meter.get_rms();

        assert!((actual_rms - expected_rms).abs() < 0.01);
    }

    #[test]
    fn test_level_meter_peak() {
        let mut meter = LevelMeter::new(1024);

        let samples = vec![0.0, 0.3, 0.7, 0.2, 0.1];
        meter.push_samples(&samples);

        assert!((meter.get_peak() - 0.7).abs() < 0.01);
    }

    #[test]
    fn test_shared_level() {
        let shared = SharedLevel::new();

        shared.set_level(0.75);
        shared.set_peak(0.9);

        assert!((shared.get_level() - 0.75).abs() < 0.001);
        assert!((shared.get_peak() - 0.9).abs() < 0.001);
    }

    #[test]
    fn test_level_meter_reset() {
        let mut meter = LevelMeter::new(1024);

        meter.push_samples(&[0.5, 0.5, 0.5]);
        assert!(meter.get_rms() > 0.0);

        meter.reset();
        assert_eq!(meter.get_rms(), 0.0);
        assert_eq!(meter.get_peak(), 0.0);
    }
}

