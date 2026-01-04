//! 共享类型定义模块
//!
//! 定义前后端共享的数据类型，通过 specta 导出到 TypeScript

use serde::{Deserialize, Serialize};
use specta::Type;

/// 应用全局配置
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AppConfig {
    /// Schema 版本号
    pub schema_version: u32,
    /// 界面语言
    pub language: String,
    /// 主题模式
    pub theme: ThemeMode,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            schema_version: 1,
            language: "zh-CN".to_string(),
            theme: ThemeMode::System,
        }
    }
}

/// 主题模式
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, Default)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    /// 浅色模式
    Light,
    /// 深色模式
    Dark,
    /// 跟随系统
    #[default]
    System,
}

/// Session 状态
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    /// 已创建
    Created,
    /// 录制中
    Recording,
    /// 已暂停
    Paused,
    /// 已完成
    Completed,
    /// 错误
    Error,
}

/// 模式类型
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ModeType {
    /// 会议模式
    Meeting,
    /// 输入法模式
    InputMethod,
    /// 面试官模式
    Interviewer,
    /// 面试者模式
    Interviewee,
}

/// 音频源类型
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AudioSourceType {
    /// 系统音频
    System,
    /// 麦克风
    Microphone,
}

/// 音频设备信息
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AudioDevice {
    /// 设备 ID
    pub id: String,
    /// 设备名称
    pub name: String,
    /// 设备类型
    pub source_type: AudioSourceType,
    /// 是否为默认设备
    pub is_default: bool,
}

