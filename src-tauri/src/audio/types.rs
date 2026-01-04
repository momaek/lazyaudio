//! 音频采集相关类型定义
//!
//! 定义音频源、音频数据块、音频流等类型

use serde::{Deserialize, Serialize};
use specta::Type;
use std::time::Instant;
use tokio::sync::mpsc;

// ============================================================================
// 音频源类型
// ============================================================================

/// 音频源类型
#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AudioSourceType {
    /// 系统音频（全局）
    SystemAudio,
    /// 指定应用的音频
    Application {
        /// 应用的 Bundle ID (macOS)
        bundle_id: String,
        /// 进程 ID
        pid: u32,
    },
    /// 麦克风输入
    Microphone,
}

/// 音频源信息
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AudioSource {
    /// 音频源唯一标识
    pub id: String,
    /// 音频源名称（用于显示）
    pub name: String,
    /// 音频源类型
    pub source_type: AudioSourceType,
    /// 是否为默认设备
    pub is_default: bool,
    /// 采样率（Hz）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sample_rate: Option<u32>,
    /// 通道数
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channels: Option<u16>,
}

impl AudioSource {
    /// 创建系统音频源
    pub fn system_audio() -> Self {
        Self {
            id: "system".to_string(),
            name: "系统音频".to_string(),
            source_type: AudioSourceType::SystemAudio,
            is_default: true,
            sample_rate: Some(48000),
            channels: Some(2),
        }
    }

    /// 创建麦克风音频源
    pub fn microphone(id: String, name: String, is_default: bool) -> Self {
        Self {
            id,
            name,
            source_type: AudioSourceType::Microphone,
            is_default,
            sample_rate: None,
            channels: None,
        }
    }

    /// 创建应用音频源
    pub fn application(id: String, name: String, bundle_id: String, pid: u32) -> Self {
        Self {
            id,
            name,
            source_type: AudioSourceType::Application { bundle_id, pid },
            is_default: false,
            sample_rate: Some(48000),
            channels: Some(2),
        }
    }
}

// ============================================================================
// 音频采集配置
// ============================================================================

/// 音频采集配置
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AudioCaptureConfig {
    /// 目标采样率（Hz），默认 48000
    pub sample_rate: u32,
    /// 目标通道数，默认 2（立体声）
    pub channels: u16,
    /// 缓冲区大小（采样数）
    pub buffer_size: u32,
}

impl Default for AudioCaptureConfig {
    fn default() -> Self {
        Self {
            sample_rate: 48000,
            channels: 2,
            buffer_size: 4096,
        }
    }
}

// ============================================================================
// 音频数据块
// ============================================================================

/// 音频数据块
///
/// 包含一段音频样本数据及其元信息
#[derive(Debug, Clone)]
pub struct AudioChunk {
    /// 音频样本数据（f32 交错格式）
    pub samples: Vec<f32>,
    /// 时间戳（从采集开始的毫秒数）
    pub timestamp_ms: u64,
    /// 采样率（Hz）
    pub sample_rate: u32,
    /// 通道数
    pub channels: u16,
}

impl AudioChunk {
    /// 创建新的音频数据块
    pub fn new(samples: Vec<f32>, timestamp_ms: u64, sample_rate: u32, channels: u16) -> Self {
        Self {
            samples,
            timestamp_ms,
            sample_rate,
            channels,
        }
    }

    /// 获取样本帧数
    pub fn frame_count(&self) -> usize {
        if self.channels == 0 {
            return 0;
        }
        self.samples.len() / self.channels as usize
    }

    /// 获取数据时长（毫秒）
    pub fn duration_ms(&self) -> f64 {
        if self.sample_rate == 0 {
            return 0.0;
        }
        (self.frame_count() as f64 / self.sample_rate as f64) * 1000.0
    }

    /// 计算 RMS 音量（分贝）
    pub fn rms_db(&self) -> f32 {
        if self.samples.is_empty() {
            return -100.0;
        }

        let sum_sq: f32 = self.samples.iter().map(|s| s * s).sum();
        let rms = (sum_sq / self.samples.len() as f32).sqrt();

        if rms > 0.0 {
            20.0 * rms.log10()
        } else {
            -100.0
        }
    }

    /// 计算归一化音量（0.0 - 1.0）
    pub fn level(&self) -> f32 {
        if self.samples.is_empty() {
            return 0.0;
        }

        let sum_sq: f32 = self.samples.iter().map(|s| s * s).sum();
        let rms = (sum_sq / self.samples.len() as f32).sqrt();

        // 将 RMS 映射到 0-1 范围，假设 -60dB 为静音
        let db = if rms > 0.0 { 20.0 * rms.log10() } else { -100.0 };
        ((db + 60.0) / 60.0).clamp(0.0, 1.0)
    }
}

// ============================================================================
// 音频流
// ============================================================================

/// 音频流类型（mpsc 接收端）
pub type AudioStream = mpsc::Receiver<AudioChunk>;

/// 音频流发送端
pub type AudioStreamSender = mpsc::Sender<AudioChunk>;

/// 创建音频流通道
///
/// # Arguments
/// * `buffer_size` - 通道缓冲区大小
///
/// # Returns
/// (发送端, 接收端)
pub fn create_audio_stream(buffer_size: usize) -> (AudioStreamSender, AudioStream) {
    mpsc::channel(buffer_size)
}

// ============================================================================
// 采集状态
// ============================================================================

/// 音频采集状态
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum CaptureState {
    /// 空闲状态
    Idle,
    /// 正在采集
    Running,
    /// 已暂停
    Paused,
    /// 已停止
    Stopped,
    /// 错误状态
    Error,
}

impl Default for CaptureState {
    fn default() -> Self {
        Self::Idle
    }
}

// ============================================================================
// 采集统计
// ============================================================================

/// 音频采集统计信息
#[derive(Debug, Clone, Default)]
pub struct CaptureStats {
    /// 已处理的样本总数
    pub total_samples: u64,
    /// 已处理的帧总数
    pub total_frames: u64,
    /// 丢弃的数据块数（因为 buffer 满）
    pub dropped_chunks: u64,
    /// 采集开始时间
    pub start_time: Option<Instant>,
}

impl CaptureStats {
    /// 获取采集时长（秒）
    pub fn duration_secs(&self) -> f64 {
        self.start_time
            .map(|t| t.elapsed().as_secs_f64())
            .unwrap_or(0.0)
    }
}

// ============================================================================
// 错误类型
// ============================================================================

/// 音频采集错误
#[derive(Debug, thiserror::Error)]
pub enum AudioError {
    /// 权限被拒绝
    #[error("权限被拒绝: {0}")]
    PermissionDenied(String),

    /// 设备未找到
    #[error("设备未找到: {0}")]
    DeviceNotFound(String),

    /// 设备不可用
    #[error("设备不可用: {0}")]
    DeviceUnavailable(String),

    /// 配置错误
    #[error("配置错误: {0}")]
    ConfigError(String),

    /// 进程错误
    #[error("进程错误: {0}")]
    ProcessError(String),

    /// 流错误
    #[error("流错误: {0}")]
    StreamError(String),

    /// IO 错误
    #[error("IO 错误: {0}")]
    IoError(#[from] std::io::Error),

    /// 其他错误
    #[error("{0}")]
    Other(String),
}

/// 音频结果类型
pub type AudioResult<T> = Result<T, AudioError>;

