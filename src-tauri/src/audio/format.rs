//! 音频格式转换模块
//!
//! 提供音频数据的格式转换功能，包括：
//! - 采样格式转换（i16 → f32, i32 → f32）
//! - 通道数转换（单声道 → 立体声）
//! - 字节序转换

use super::types::AudioChunk;

// ============================================================================
// 采样格式转换
// ============================================================================

/// 将 i16 采样转换为 f32
///
/// # Arguments
/// * `samples` - i16 采样数据
///
/// # Returns
/// f32 采样数据（范围 -1.0 到 1.0）
#[inline]
pub fn i16_to_f32(samples: &[i16]) -> Vec<f32> {
    samples
        .iter()
        .map(|&s| f32::from(s) / 32768.0)
        .collect()
}

/// 将 i32 采样转换为 f32
///
/// # Arguments
/// * `samples` - i32 采样数据
///
/// # Returns
/// f32 采样数据（范围 -1.0 到 1.0）
#[inline]
pub fn i32_to_f32(samples: &[i32]) -> Vec<f32> {
    samples
        .iter()
        .map(|&s| s as f32 / 2_147_483_648.0)
        .collect()
}

/// 将 f32 采样转换为 i16
///
/// # Arguments
/// * `samples` - f32 采样数据
///
/// # Returns
/// i16 采样数据
#[inline]
pub fn f32_to_i16(samples: &[f32]) -> Vec<i16> {
    samples
        .iter()
        .map(|&s| (s.clamp(-1.0, 1.0) * 32767.0) as i16)
        .collect()
}

// ============================================================================
// 字节转换
// ============================================================================

/// 从小端字节流解析 f32 采样
///
/// # Arguments
/// * `bytes` - 字节数据（每个采样 4 字节，小端序）
///
/// # Returns
/// f32 采样数据
pub fn bytes_to_f32_le(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(4)
        .map(|chunk| {
            let arr: [u8; 4] = chunk.try_into().unwrap();
            f32::from_le_bytes(arr)
        })
        .collect()
}

/// 从小端字节流解析 i16 采样
///
/// # Arguments
/// * `bytes` - 字节数据（每个采样 2 字节，小端序）
///
/// # Returns
/// i16 采样数据
pub fn bytes_to_i16_le(bytes: &[u8]) -> Vec<i16> {
    bytes
        .chunks_exact(2)
        .map(|chunk| {
            let arr: [u8; 2] = chunk.try_into().unwrap();
            i16::from_le_bytes(arr)
        })
        .collect()
}

/// 将 f32 采样转换为小端字节流
///
/// # Arguments
/// * `samples` - f32 采样数据
///
/// # Returns
/// 字节数据
pub fn f32_to_bytes_le(samples: &[f32]) -> Vec<u8> {
    samples
        .iter()
        .flat_map(|&s| s.to_le_bytes())
        .collect()
}

// ============================================================================
// 通道转换
// ============================================================================

/// 将单声道转换为立体声（复制到两个通道）
///
/// # Arguments
/// * `mono` - 单声道采样数据
///
/// # Returns
/// 立体声采样数据（交错格式：L0, R0, L1, R1, ...）
pub fn mono_to_stereo(mono: &[f32]) -> Vec<f32> {
    let mut stereo = Vec::with_capacity(mono.len() * 2);
    for &sample in mono {
        stereo.push(sample); // Left
        stereo.push(sample); // Right
    }
    stereo
}

/// 将立体声转换为单声道（取平均值）
///
/// # Arguments
/// * `stereo` - 立体声采样数据（交错格式）
///
/// # Returns
/// 单声道采样数据
pub fn stereo_to_mono(stereo: &[f32]) -> Vec<f32> {
    stereo
        .chunks_exact(2)
        .map(|chunk| (chunk[0] + chunk[1]) / 2.0)
        .collect()
}

/// 将多通道音频转换为指定通道数
///
/// # Arguments
/// * `samples` - 原始采样数据（交错格式）
/// * `src_channels` - 源通道数
/// * `dst_channels` - 目标通道数
///
/// # Returns
/// 转换后的采样数据
pub fn convert_channels(samples: &[f32], src_channels: u16, dst_channels: u16) -> Vec<f32> {
    if src_channels == dst_channels {
        return samples.to_vec();
    }

    match (src_channels, dst_channels) {
        (1, 2) => mono_to_stereo(samples),
        (2, 1) => stereo_to_mono(samples),
        (src, dst) if src > dst => {
            // 多通道转少通道：取前 dst 个通道的平均值
            let src = src as usize;
            let dst = dst as usize;
            samples
                .chunks_exact(src)
                .flat_map(|frame| {
                    let avg: f32 = frame.iter().take(dst).sum::<f32>() / dst as f32;
                    std::iter::repeat(avg).take(dst)
                })
                .collect()
        }
        (src, dst) => {
            // 少通道转多通道：复制最后一个通道
            let src = src as usize;
            let dst = dst as usize;
            samples
                .chunks_exact(src)
                .flat_map(|frame| {
                    let mut result = Vec::with_capacity(dst);
                    result.extend_from_slice(frame);
                    let last = *frame.last().unwrap_or(&0.0);
                    result.resize(dst, last);
                    result
                })
                .collect()
        }
    }
}

// ============================================================================
// AudioChunk 格式转换
// ============================================================================

/// 转换 AudioChunk 的通道数
pub fn convert_chunk_channels(chunk: &AudioChunk, target_channels: u16) -> AudioChunk {
    if chunk.channels == target_channels {
        return chunk.clone();
    }

    let converted = convert_channels(&chunk.samples, chunk.channels, target_channels);
    AudioChunk::new(
        converted,
        chunk.timestamp_ms,
        chunk.sample_rate,
        target_channels,
    )
}

// ============================================================================
// 测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_i16_to_f32() {
        let i16_samples = vec![0i16, 16384, -16384, 32767, -32768];
        let f32_samples = i16_to_f32(&i16_samples);

        assert!((f32_samples[0] - 0.0).abs() < 0.001);
        assert!((f32_samples[1] - 0.5).abs() < 0.001);
        assert!((f32_samples[2] - -0.5).abs() < 0.001);
        assert!((f32_samples[3] - 1.0).abs() < 0.001);
        assert!((f32_samples[4] - -1.0).abs() < 0.001);
    }

    #[test]
    fn test_bytes_to_f32_le() {
        // 0.5f32 in little endian
        let bytes = [0x00, 0x00, 0x00, 0x3f];
        let samples = bytes_to_f32_le(&bytes);
        assert!((samples[0] - 0.5).abs() < 0.001);
    }

    #[test]
    fn test_mono_to_stereo() {
        let mono = vec![0.5, -0.5, 0.25];
        let stereo = mono_to_stereo(&mono);

        assert_eq!(stereo.len(), 6);
        assert!((stereo[0] - 0.5).abs() < 0.001);
        assert!((stereo[1] - 0.5).abs() < 0.001);
        assert!((stereo[2] - -0.5).abs() < 0.001);
        assert!((stereo[3] - -0.5).abs() < 0.001);
    }

    #[test]
    fn test_stereo_to_mono() {
        let stereo = vec![0.5, 0.3, -0.5, -0.3];
        let mono = stereo_to_mono(&stereo);

        assert_eq!(mono.len(), 2);
        assert!((mono[0] - 0.4).abs() < 0.001);
        assert!((mono[1] - -0.4).abs() < 0.001);
    }

    #[test]
    fn test_convert_channels_same() {
        let samples = vec![0.5, -0.5];
        let converted = convert_channels(&samples, 2, 2);
        assert_eq!(converted, samples);
    }
}

