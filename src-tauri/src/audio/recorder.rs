//! WAV 录制器
//!
//! 将音频数据录制到 WAV 文件

use hound::{WavSpec, WavWriter};
use std::fs::File;
use std::io::BufWriter;
use std::path::PathBuf;

use super::types::{AudioError, AudioResult};

/// WAV 录制器
pub struct WavRecorder {
    /// WAV 写入器
    writer: Option<WavWriter<BufWriter<File>>>,
    /// 输出文件路径
    path: PathBuf,
    /// 采样率
    sample_rate: u32,
    /// 声道数
    channels: u16,
    /// 已写入的采样数
    samples_written: u64,
}

impl WavRecorder {
    /// 创建新的录制器
    ///
    /// # Arguments
    /// * `path` - 输出文件路径
    /// * `sample_rate` - 采样率（如 48000）
    /// * `channels` - 声道数（1=单声道, 2=立体声）
    pub fn new(path: PathBuf, sample_rate: u32, channels: u16) -> AudioResult<Self> {
        let spec = WavSpec {
            channels,
            sample_rate,
            bits_per_sample: 32,
            sample_format: hound::SampleFormat::Float,
        };

        // 确保父目录存在
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                AudioError::ConfigError(format!("无法创建目录 {:?}: {}", parent, e))
            })?;
        }

        let writer = WavWriter::create(&path, spec)
            .map_err(|e| AudioError::ConfigError(format!("无法创建 WAV 文件: {}", e)))?;

        tracing::info!("WAV 录制器已创建: {:?}", path);

        Ok(Self {
            writer: Some(writer),
            path,
            sample_rate,
            channels,
            samples_written: 0,
        })
    }

    /// 写入音频采样
    ///
    /// # Arguments
    /// * `samples` - f32 格式的音频采样数据
    pub fn write_samples(&mut self, samples: &[f32]) -> AudioResult<()> {
        if let Some(ref mut writer) = self.writer {
            for &sample in samples {
                writer
                    .write_sample(sample)
                    .map_err(|e| AudioError::ConfigError(format!("写入采样失败: {}", e)))?;
            }
            self.samples_written += samples.len() as u64;
            Ok(())
        } else {
            Err(AudioError::ConfigError("录制器已关闭".to_string()))
        }
    }

    /// 完成录制并关闭文件
    pub fn finalize(&mut self) -> AudioResult<()> {
        if let Some(writer) = self.writer.take() {
            writer
                .finalize()
                .map_err(|e| AudioError::ConfigError(format!("完成录制失败: {}", e)))?;
            
            let duration_secs = self.samples_written as f64 
                / self.sample_rate as f64 
                / self.channels as f64;
            
            tracing::info!(
                "WAV 录制完成: {:?}, 时长: {:.2}s, 采样数: {}",
                self.path,
                duration_secs,
                self.samples_written
            );
        }
        Ok(())
    }

    /// 获取输出文件路径
    pub fn path(&self) -> &PathBuf {
        &self.path
    }

    /// 获取已写入的采样数
    pub fn samples_written(&self) -> u64 {
        self.samples_written
    }

    /// 获取录制时长（秒）
    pub fn duration_secs(&self) -> f64 {
        self.samples_written as f64 / self.sample_rate as f64 / self.channels as f64
    }
}

impl Drop for WavRecorder {
    fn drop(&mut self) {
        if self.writer.is_some() {
            if let Err(e) = self.finalize() {
                tracing::error!("关闭 WAV 录制器失败: {}", e);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env::temp_dir;

    #[test]
    fn test_wav_recorder() {
        let path = temp_dir().join("test_recording.wav");
        let mut recorder = WavRecorder::new(path.clone(), 48000, 2).unwrap();

        // 写入 1 秒的静音
        let samples = vec![0.0f32; 48000 * 2];
        recorder.write_samples(&samples).unwrap();

        assert_eq!(recorder.samples_written(), 96000);
        assert!((recorder.duration_secs() - 1.0).abs() < 0.01);

        recorder.finalize().unwrap();
        assert!(path.exists());

        // 清理
        std::fs::remove_file(path).ok();
    }
}

