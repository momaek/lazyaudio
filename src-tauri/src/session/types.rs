//! Session 类型定义模块
//!
//! 定义 Session 相关的配置和运行时类型

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::audio::AudioSource;
use crate::storage::{SessionAudioConfig, AudioSourceInfo, AudioSourceType};

/// Session ID 类型
pub type SessionId = String;

/// Session 配置
///
/// 用于创建新 Session 时指定配置
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfig {
    /// 模式 ID
    pub mode_id: String,
    /// Session 名称
    #[serde(default)]
    pub name: Option<String>,
    /// 音频源配置
    #[serde(default)]
    pub audio_sources: Vec<AudioSourceConfig>,
    /// 是否启用录制
    #[serde(default = "default_true")]
    pub enable_recording: bool,
    /// 是否使用麦克风
    #[serde(default = "default_true")]
    pub use_microphone: bool,
    /// 是否使用系统音频
    #[serde(default)]
    pub use_system_audio: bool,
    /// 麦克风优先级
    #[serde(default = "default_priority")]
    pub microphone_priority: u8,
}

fn default_true() -> bool {
    true
}

fn default_priority() -> u8 {
    crate::audio::PRIORITY_PRIMARY
}

impl Default for SessionConfig {
    fn default() -> Self {
        Self {
            mode_id: "meeting".to_string(),
            name: None,
            audio_sources: Vec::new(),
            enable_recording: true,
            use_microphone: true,
            use_system_audio: false,
            microphone_priority: crate::audio::PRIORITY_PRIMARY,
        }
    }
}

impl SessionConfig {
    /// 创建会议模式配置
    #[must_use]
    pub fn meeting() -> Self {
        Self {
            mode_id: "meeting".to_string(),
            use_microphone: true,
            use_system_audio: true,
            ..Default::default()
        }
    }

    /// 创建输入法模式配置
    #[must_use]
    pub fn input_method() -> Self {
        Self {
            mode_id: "input_method".to_string(),
            use_microphone: true,
            use_system_audio: false,
            enable_recording: false,
            microphone_priority: crate::audio::PRIORITY_INPUT_METHOD,
            ..Default::default()
        }
    }

    /// 转换为 SessionAudioConfig
    #[must_use]
    pub fn to_audio_config(&self) -> SessionAudioConfig {
        SessionAudioConfig {
            sources: self
                .audio_sources
                .iter()
                .map(|s| AudioSourceInfo {
                    id: s.source_id.clone().unwrap_or_default(),
                    source_type: s.source_type,
                    name: s.name.clone().unwrap_or_default(),
                    bundle_id: None,
                })
                .collect(),
            sample_rate: 48000,
            channels: 2,
            save_audio: self.enable_recording,
        }
    }
}

/// 音频源配置
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AudioSourceConfig {
    /// 源类型
    pub source_type: AudioSourceType,
    /// 源 ID（可选，为空时使用默认设备）
    #[serde(default)]
    pub source_id: Option<String>,
    /// 源名称
    #[serde(default)]
    pub name: Option<String>,
}

impl From<&AudioSource> for AudioSourceConfig {
    fn from(source: &AudioSource) -> Self {
        Self {
            source_type: match &source.source_type {
                crate::audio::AudioSourceType::SystemAudio => AudioSourceType::System,
                crate::audio::AudioSourceType::Application { .. } => AudioSourceType::Application,
                crate::audio::AudioSourceType::Microphone => AudioSourceType::Microphone,
            },
            source_id: Some(source.id.clone()),
            name: Some(source.name.clone()),
        }
    }
}

/// Session 运行时信息
///
/// 包含 Session 的实时状态信息
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    /// Session ID
    pub id: SessionId,
    /// 模式 ID
    pub mode_id: String,
    /// 状态
    pub status: String,
    /// 名称
    #[serde(default)]
    pub name: Option<String>,
    /// 创建时间
    pub created_at: String,
    /// 更新时间
    pub updated_at: String,
    /// 时长（毫秒）
    pub duration_ms: u64,
    /// 字数
    pub word_count: u32,
    /// 是否正在录制
    pub is_recording: bool,
    /// 是否已暂停
    pub is_paused: bool,
    /// 是否拥有麦克风
    pub has_microphone: bool,
}

/// Session 统计信息
#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatsUpdate {
    /// 时长增量（毫秒）
    #[serde(default)]
    pub duration_ms_delta: u64,
    /// 字数增量
    #[serde(default)]
    pub word_count_delta: u32,
    /// 字符数增量
    #[serde(default)]
    pub character_count_delta: u32,
    /// 段落数增量
    #[serde(default)]
    pub segment_count_delta: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_config_default() {
        let config = SessionConfig::default();
        assert_eq!(config.mode_id, "meeting");
        assert!(config.enable_recording);
        assert!(config.use_microphone);
    }

    #[test]
    fn test_session_config_meeting() {
        let config = SessionConfig::meeting();
        assert_eq!(config.mode_id, "meeting");
        assert!(config.use_system_audio);
    }

    #[test]
    fn test_session_config_input_method() {
        let config = SessionConfig::input_method();
        assert_eq!(config.mode_id, "input_method");
        assert!(!config.enable_recording);
        assert_eq!(config.microphone_priority, crate::audio::PRIORITY_INPUT_METHOD);
    }
}

