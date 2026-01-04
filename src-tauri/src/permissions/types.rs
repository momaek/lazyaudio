//! 权限类型定义
//!
//! 定义跨平台的权限类型和状态枚举

use serde::{Deserialize, Serialize};
use specta::Type;

/// 权限类型枚举
///
/// 定义应用所需的各种系统权限
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum PermissionType {
    /// 系统音频录制权限（macOS 14.4+ 支持仅音频录制）
    /// - macOS: 需要在系统设置 > 隐私与安全性 > 录屏与系统录音 中授权
    ///   用户可选择"仅录音"而不需要屏幕录制权限
    /// - Windows: 不需要（NotApplicable）
    SystemAudioRecording,

    /// 麦克风权限
    /// - macOS: 可通过弹窗请求
    /// - Windows: 可通过弹窗请求
    Microphone,

    /// 辅助功能权限（用于全局快捷键和输入法模式）
    /// - macOS: 需要在系统偏好设置中授权
    /// - Windows: 不需要（NotApplicable）
    Accessibility,
}

impl PermissionType {
    /// 获取所有权限类型
    #[must_use]
    pub fn all() -> Vec<Self> {
        vec![Self::SystemAudioRecording, Self::Microphone, Self::Accessibility]
    }

    /// 获取必需的权限类型
    #[must_use]
    pub fn required() -> Vec<Self> {
        vec![Self::SystemAudioRecording, Self::Microphone]
    }

    /// 获取权限的显示名称
    #[must_use]
    pub fn display_name(&self) -> &'static str {
        match self {
            Self::SystemAudioRecording => "系统音频录制",
            Self::Microphone => "麦克风",
            Self::Accessibility => "辅助功能",
        }
    }

    /// 获取权限的描述
    #[must_use]
    pub fn description(&self) -> &'static str {
        match self {
            Self::SystemAudioRecording => "用于捕获系统音频（可在设置中选择「仅录音」）",
            Self::Microphone => "用于录制麦克风音频",
            Self::Accessibility => "用于全局快捷键和输入法模式，需要在系统设置中授权",
        }
    }

    /// 检查该权限是否可以程序化请求
    #[must_use]
    pub fn can_request(&self) -> bool {
        matches!(self, Self::Microphone)
    }
}

/// 权限状态枚举
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum PermissionStatus {
    /// 已授权
    Granted,

    /// 已拒绝
    Denied,

    /// 未决定（首次请求前）
    NotDetermined,

    /// 受限（如家长控制）
    Restricted,

    /// 不适用（如 Windows 不需要屏幕录制权限）
    NotApplicable,
}

impl PermissionStatus {
    /// 检查权限是否已授权
    #[must_use]
    pub fn is_granted(&self) -> bool {
        matches!(self, Self::Granted | Self::NotApplicable)
    }

    /// 检查权限是否被拒绝
    #[must_use]
    pub fn is_denied(&self) -> bool {
        matches!(self, Self::Denied | Self::Restricted)
    }

    /// 检查权限是否可以请求
    #[must_use]
    pub fn can_request(&self) -> bool {
        matches!(self, Self::NotDetermined)
    }
}

/// 权限检查结果
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PermissionCheckResult {
    /// 权限类型
    pub permission_type: PermissionType,
    /// 权限状态
    pub status: PermissionStatus,
    /// 是否为必需权限
    pub required: bool,
}

/// 所有权限的状态汇总
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AllPermissionsStatus {
    /// 系统音频录制权限状态
    pub system_audio_recording: PermissionStatus,
    /// 麦克风权限状态
    pub microphone: PermissionStatus,
    /// 辅助功能权限状态
    pub accessibility: PermissionStatus,
    /// 是否所有必需权限都已授权
    pub all_required_granted: bool,
}

impl AllPermissionsStatus {
    /// 创建新的权限状态汇总
    #[must_use]
    pub fn new(
        system_audio_recording: PermissionStatus,
        microphone: PermissionStatus,
        accessibility: PermissionStatus,
    ) -> Self {
        let all_required_granted = system_audio_recording.is_granted() && microphone.is_granted();

        Self {
            system_audio_recording,
            microphone,
            accessibility,
            all_required_granted,
        }
    }
}

