//! 音频采集和处理模块
//!
//! 本模块提供音频采集的核心功能，包括：
//! - 系统音频采集（macOS: AudioCapCLI, Windows: WASAPI）
//! - 麦克风采集（跨平台 cpal）
//! - 音频格式转换
//!
//! # 架构
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────────┐
//! │                    AudioCapture trait                        │
//! ├─────────────────────────────────────────────────────────────┤
//! │                                                              │
//! │  ┌─────────────────────┐    ┌─────────────────────────────┐ │
//! │  │ MacOSSystemCapture  │    │    MicrophoneCapture        │ │
//! │  │  (AudioCapCLI)      │    │       (cpal)                │ │
//! │  └─────────┬───────────┘    └─────────────┬───────────────┘ │
//! │            │                              │                  │
//! │            └──────────┬───────────────────┘                  │
//! │                       ▼                                      │
//! │              AudioStream (mpsc::Receiver<AudioChunk>)        │
//! │                                                              │
//! └─────────────────────────────────────────────────────────────┘
//! ```

// 子模块
mod capture;
mod format;
mod types;

// macOS 平台特定模块
#[cfg(target_os = "macos")]
mod audiocap_cli;
#[cfg(target_os = "macos")]
pub mod macos;

// 麦克风采集（跨平台）
mod microphone;

// 导出类型
pub use capture::{AsyncAudioCapture, AudioCapture};
pub use format::*;
pub use types::*;

// 导出平台特定实现
#[cfg(target_os = "macos")]
pub use audiocap_cli::AudioCapProcess;
#[cfg(target_os = "macos")]
pub use macos::MacOSSystemCapture;

pub use microphone::MicrophoneCapture;

// ============================================================================
// 便捷函数
// ============================================================================

/// 列出所有可用的音频源
///
/// 返回系统音频源和麦克风设备列表
pub fn list_all_sources() -> AudioResult<Vec<AudioSource>> {
    let mut sources = Vec::new();

    // 添加系统音频源
    #[cfg(target_os = "macos")]
    {
        sources.push(AudioSource::system_audio());
    }

    // 添加麦克风设备
    match microphone::list_microphones() {
        Ok(mics) => sources.extend(mics),
        Err(e) => {
            tracing::warn!("获取麦克风列表失败: {}", e);
        }
    }

    Ok(sources)
}

/// 列出可用的麦克风设备
pub fn list_microphones() -> AudioResult<Vec<AudioSource>> {
    microphone::list_microphones()
}
