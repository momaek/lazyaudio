use tracing::debug;

use crate::asr::VadConfig;
use crate::audio::AudioChunk;

pub(crate) fn build_silero_vad_config(vad_sensitivity: f32) -> VadConfig {
    let sensitivity = vad_sensitivity.clamp(0.0, 1.0);
    // Higher sensitivity -> lower threshold and shorter required silence.
    let threshold = (0.7 - 0.4 * sensitivity).clamp(0.2, 0.8);
    let min_silence_duration = (0.9 - 0.6 * sensitivity).clamp(0.3, 1.2);

    VadConfig {
        min_silence_duration,
        min_speech_duration: 0.3,
        max_speech_duration: 28.0,
        threshold,
        ..Default::default()
    }
}

/// 合并麦克风和系统音频数据
/// 
/// 注意：如果两个音频源采样率不同，优先使用系统音频（通常包含会议的主要内容）
pub(crate) fn merge_audio_chunks(
    mic: &Option<AudioChunk>,
    system: &Option<AudioChunk>,
) -> Option<AudioChunk> {
    match (mic, system) {
        (Some(m), Some(s)) => {
            // 检查采样率是否一致
            if m.sample_rate != s.sample_rate {
                // 采样率不同，无法直接混合
                // 优先使用系统音频（通常包含会议内容），麦克风用于补充
                // TODO: 未来可以实现重采样后混合
                debug!(
                    "音频采样率不同: mic={}Hz, system={}Hz, 使用系统音频",
                    m.sample_rate, s.sample_rate
                );
                return Some(s.clone());
            }
            
            // 采样率相同，可以混合
            let len = m.samples.len().min(s.samples.len());
            let mut mixed = Vec::with_capacity(len);
            
            for i in 0..len {
                // 简单混合：平均
                mixed.push((m.samples[i] + s.samples[i]) / 2.0);
            }
            
            Some(AudioChunk {
                samples: mixed,
                sample_rate: m.sample_rate,
                channels: m.channels,
                timestamp_ms: m.timestamp_ms,
            })
        }
        (Some(m), None) => Some(m.clone()),
        (None, Some(s)) => Some(s.clone()),
        (None, None) => None,
    }
}
