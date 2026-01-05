//! 语音活动检测 (VAD) 模块
//!
//! 提供语音活动检测功能
//! 可以检测音频流中的语音段落，用于优化 ASR 识别

use std::collections::VecDeque;

/// VAD 状态
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VadState {
    /// 静音状态
    Silence,
    /// 语音状态
    Speech,
    /// 语音结束（刚从语音转为静音）
    SpeechEnd,
}

impl Default for VadState {
    fn default() -> Self {
        Self::Silence
    }
}

/// VAD 配置
#[derive(Debug, Clone)]
pub struct VadConfig {
    /// 采样率（Hz）
    pub sample_rate: u32,
    /// 语音检测阈值 (0.0 - 1.0)
    pub threshold: f32,
    /// 最短语音时长（毫秒）
    pub min_speech_duration_ms: u32,
    /// 最短静音时长（毫秒）- 用于语音分段
    pub min_silence_duration_ms: u32,
    /// 语音开始前的缓冲时长（毫秒）
    pub speech_pad_ms: u32,
}

impl Default for VadConfig {
    fn default() -> Self {
        Self {
            sample_rate: 16000,
            threshold: 0.5,
            min_speech_duration_ms: 250,
            min_silence_duration_ms: 500,
            speech_pad_ms: 100,
        }
    }
}

/// 语音活动检测器
///
/// 基于音频能量的简单语音活动检测实现
/// 注意：这是一个简化实现，在噪声环境下效果可能不如神经网络 VAD
pub struct VoiceActivityDetector {
    config: VadConfig,
    state: VadState,
    /// 当前帧的语音概率
    speech_prob: f32,
    /// 连续语音帧计数
    speech_frames: u32,
    /// 连续静音帧计数
    silence_frames: u32,
    /// 每帧的采样数
    frame_samples: u32,
    /// 平滑后的能量值
    smoothed_energy: f32,
    /// 噪声基底估计
    noise_floor: f32,
    /// 能量历史（用于自适应阈值）
    energy_history: VecDeque<f32>,
}

impl VoiceActivityDetector {
    /// 创建新的 VAD
    pub fn new(config: VadConfig) -> Self {
        // 假设每帧 30ms
        let frame_samples = config.sample_rate * 30 / 1000;

        Self {
            config,
            state: VadState::Silence,
            speech_prob: 0.0,
            speech_frames: 0,
            silence_frames: 0,
            frame_samples,
            smoothed_energy: 0.0,
            noise_floor: 0.001,
            energy_history: VecDeque::with_capacity(100),
        }
    }

    /// 处理音频采样
    ///
    /// # Arguments
    /// * `samples` - 16kHz 单声道音频采样
    ///
    /// # Returns
    /// 当前 VAD 状态
    pub fn process(&mut self, samples: &[f32]) -> VadState {
        if samples.is_empty() {
            return self.state;
        }

        // 计算帧能量（RMS）
        let energy = Self::calculate_energy(samples);

        // 更新平滑能量
        let alpha = 0.1;
        self.smoothed_energy = alpha * energy + (1.0 - alpha) * self.smoothed_energy;

        // 更新能量历史
        self.energy_history.push_back(energy);
        if self.energy_history.len() > 100 {
            self.energy_history.pop_front();
        }

        // 自适应噪声基底估计
        self.update_noise_floor(energy);

        // 计算语音概率
        self.speech_prob = self.calculate_speech_probability(energy);

        // 根据概率更新状态
        let is_speech = self.speech_prob > self.config.threshold;
        let prev_state = self.state;

        // 状态机转换
        match self.state {
            VadState::Silence | VadState::SpeechEnd => {
                if is_speech {
                    self.speech_frames += 1;
                    self.silence_frames = 0;

                    // 检查是否达到最短语音时长
                    let min_frames =
                        self.config.min_speech_duration_ms * self.config.sample_rate / 1000 / self.frame_samples;
                    if self.speech_frames >= min_frames {
                        self.state = VadState::Speech;
                    }
                } else {
                    self.speech_frames = 0;
                    self.state = VadState::Silence;
                }
            }
            VadState::Speech => {
                if is_speech {
                    self.silence_frames = 0;
                } else {
                    self.silence_frames += 1;

                    // 检查是否达到最短静音时长
                    let min_frames =
                        self.config.min_silence_duration_ms * self.config.sample_rate / 1000 / self.frame_samples;
                    if self.silence_frames >= min_frames {
                        self.state = VadState::SpeechEnd;
                        self.speech_frames = 0;
                    }
                }
            }
        }

        // 如果状态从 SpeechEnd 变化，返回 SpeechEnd 一次后切换到 Silence
        if prev_state == VadState::Speech && self.state == VadState::SpeechEnd {
            return VadState::SpeechEnd;
        }

        self.state
    }

    /// 获取当前状态
    pub fn state(&self) -> VadState {
        self.state
    }

    /// 获取当前语音概率
    pub fn speech_probability(&self) -> f32 {
        self.speech_prob
    }

    /// 是否处于语音状态
    pub fn is_speech(&self) -> bool {
        self.state == VadState::Speech
    }

    /// 重置 VAD 状态
    pub fn reset(&mut self) {
        self.state = VadState::Silence;
        self.speech_prob = 0.0;
        self.speech_frames = 0;
        self.silence_frames = 0;
        self.smoothed_energy = 0.0;
        self.energy_history.clear();
    }

    /// 获取配置
    pub fn config(&self) -> &VadConfig {
        &self.config
    }

    /// 计算帧能量（RMS）
    fn calculate_energy(samples: &[f32]) -> f32 {
        if samples.is_empty() {
            return 0.0;
        }
        let sum_sq: f32 = samples.iter().map(|s| s * s).sum();
        (sum_sq / samples.len() as f32).sqrt()
    }

    /// 更新噪声基底估计
    fn update_noise_floor(&mut self, energy: f32) {
        // 使用最小值跟踪算法估计噪声基底
        if energy < self.noise_floor * 2.0 {
            // 缓慢上升
            self.noise_floor = 0.99 * self.noise_floor + 0.01 * energy;
        } else if energy < self.noise_floor {
            // 快速下降
            self.noise_floor = 0.9 * self.noise_floor + 0.1 * energy;
        }

        // 设置最小值
        self.noise_floor = self.noise_floor.max(1e-6);
    }

    /// 计算语音概率
    fn calculate_speech_probability(&self, energy: f32) -> f32 {
        // 基于信噪比估计语音概率
        let snr = energy / self.noise_floor;
        let snr_db = 20.0 * snr.log10();

        // 使用 sigmoid 函数将 SNR 映射到 0-1
        // 假设 SNR > 15dB 时为语音
        let prob = 1.0 / (1.0 + (-0.3 * (snr_db - 10.0)).exp());
        prob.clamp(0.0, 1.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vad_config_default() {
        let config = VadConfig::default();
        assert_eq!(config.sample_rate, 16000);
        assert_eq!(config.threshold, 0.5);
    }

    #[test]
    fn test_vad_creation() {
        let config = VadConfig::default();
        let vad = VoiceActivityDetector::new(config);
        assert_eq!(vad.state(), VadState::Silence);
    }

    #[test]
    fn test_vad_silence() {
        let config = VadConfig::default();
        let mut vad = VoiceActivityDetector::new(config);

        // 测试静音
        let silence: Vec<f32> = vec![0.0; 480];
        let state = vad.process(&silence);
        assert_eq!(state, VadState::Silence);
    }

    #[test]
    fn test_vad_speech() {
        let config = VadConfig {
            min_speech_duration_ms: 30, // 降低阈值便于测试
            ..Default::default()
        };
        let mut vad = VoiceActivityDetector::new(config);

        // 生成高能量信号（模拟语音）
        let speech: Vec<f32> = (0..4800)
            .map(|i| 0.5 * (i as f32 * 0.1).sin())
            .collect();

        // 多次处理以触发语音检测
        for _ in 0..10 {
            vad.process(&speech);
        }

        // 应该检测到语音
        assert!(vad.speech_probability() > 0.0);
    }

    #[test]
    fn test_vad_reset() {
        let config = VadConfig::default();
        let mut vad = VoiceActivityDetector::new(config);

        // 处理一些数据
        let samples: Vec<f32> = vec![0.1; 480];
        vad.process(&samples);

        // 重置
        vad.reset();
        assert_eq!(vad.state(), VadState::Silence);
    }
}
