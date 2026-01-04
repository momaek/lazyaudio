//! 权限管理器
//!
//! 提供统一的权限检查和请求接口

use super::types::{AllPermissionsStatus, PermissionStatus, PermissionType};

/// 权限管理器
///
/// 提供跨平台的权限检查和请求功能
#[derive(Debug, Default)]
pub struct PermissionManager;

impl PermissionManager {
    /// 创建新的权限管理器实例
    #[must_use]
    pub fn new() -> Self {
        Self
    }

    /// 检查指定权限的状态
    #[must_use]
    #[allow(unreachable_code)]
    pub fn check(&self, permission: PermissionType) -> PermissionStatus {
        #[cfg(target_os = "macos")]
        {
            use super::macos;
            return match permission {
                PermissionType::SystemAudioRecording => macos::check_system_audio_recording_permission(),
                PermissionType::Microphone => macos::check_microphone_permission(),
                PermissionType::Accessibility => macos::check_accessibility_permission(),
            };
        }

        #[cfg(target_os = "windows")]
        {
            use super::windows;
            return match permission {
                PermissionType::SystemAudioRecording => windows::check_system_audio_recording_permission(),
                PermissionType::Microphone => windows::check_microphone_permission(),
                PermissionType::Accessibility => windows::check_accessibility_permission(),
            };
        }

        #[allow(unused_variables)]
        let _ = permission;
        PermissionStatus::NotApplicable
    }

    /// 请求指定权限
    ///
    /// 注意：并非所有权限都可以程序化请求。
    /// - macOS 系统音频录制和辅助功能权限需要用户在系统设置中手动授权
    /// - 只有麦克风权限可以通过弹窗请求
    #[allow(unreachable_code)]
    pub fn request(&self, permission: PermissionType) -> PermissionStatus {
        #[cfg(target_os = "macos")]
        {
            use super::macos;
            return match permission {
                PermissionType::SystemAudioRecording => macos::request_system_audio_recording_permission(),
                PermissionType::Microphone => macos::request_microphone_permission(),
                PermissionType::Accessibility => {
                    // 辅助功能权限不能程序化请求，只能打开设置
                    macos::check_accessibility_permission()
                }
            };
        }

        #[cfg(target_os = "windows")]
        {
            use super::windows;
            return match permission {
                PermissionType::SystemAudioRecording => windows::request_system_audio_recording_permission(),
                PermissionType::Microphone => windows::request_microphone_permission(),
                PermissionType::Accessibility => windows::check_accessibility_permission(),
            };
        }

        #[allow(unused_variables)]
        let _ = permission;
        PermissionStatus::NotApplicable
    }

    /// 打开系统权限设置页面
    ///
    /// # Errors
    /// 如果无法打开系统设置，返回错误信息
    #[allow(unreachable_code)]
    pub fn open_settings(&self, permission: PermissionType) -> Result<(), String> {
        #[cfg(target_os = "macos")]
        {
            return super::macos::open_permission_settings(permission);
        }

        #[cfg(target_os = "windows")]
        {
            return super::windows::open_permission_settings(permission);
        }

        #[allow(unused_variables)]
        let _ = permission;
        Err("不支持的平台".to_string())
    }

    /// 检查所有权限状态
    #[must_use]
    pub fn check_all(&self) -> AllPermissionsStatus {
        let system_audio_recording = self.check(PermissionType::SystemAudioRecording);
        let microphone = self.check(PermissionType::Microphone);
        let accessibility = self.check(PermissionType::Accessibility);

        AllPermissionsStatus::new(system_audio_recording, microphone, accessibility)
    }

    /// 检查所有必需权限是否已授权
    #[must_use]
    pub fn all_required_granted(&self) -> bool {
        self.check_all().all_required_granted
    }

    /// 获取所有未授权的必需权限
    #[must_use]
    pub fn get_missing_required_permissions(&self) -> Vec<PermissionType> {
        let mut missing = Vec::new();

        for permission in PermissionType::required() {
            let status = self.check(permission);
            if !status.is_granted() {
                missing.push(permission);
            }
        }

        missing
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_permission_manager_new() {
        let manager = PermissionManager::new();
        // 验证 check_all 能正常执行
        let status = manager.check_all();
        // 在测试环境中，至少应该能返回某种状态
        assert!(matches!(
            status.system_audio_recording,
            PermissionStatus::Granted
                | PermissionStatus::Denied
                | PermissionStatus::NotDetermined
                | PermissionStatus::NotApplicable
        ));
    }

    #[test]
    fn test_check_individual_permissions() {
        let manager = PermissionManager::new();

        // 测试每种权限类型的检查
        for permission in PermissionType::all() {
            let status = manager.check(permission);
            // 验证返回的状态是有效的枚举值
            assert!(matches!(
                status,
                PermissionStatus::Granted
                    | PermissionStatus::Denied
                    | PermissionStatus::NotDetermined
                    | PermissionStatus::Restricted
                    | PermissionStatus::NotApplicable
            ));
        }
    }

    #[test]
    fn test_permission_type_methods() {
        // 测试 PermissionType 的方法
        assert_eq!(PermissionType::all().len(), 3);
        assert_eq!(PermissionType::required().len(), 2);

        assert_eq!(PermissionType::SystemAudioRecording.display_name(), "系统音频录制");
        assert_eq!(PermissionType::Microphone.display_name(), "麦克风");
        assert_eq!(PermissionType::Accessibility.display_name(), "辅助功能");

        // 只有麦克风权限可以程序化请求
        assert!(!PermissionType::SystemAudioRecording.can_request());
        assert!(PermissionType::Microphone.can_request());
        assert!(!PermissionType::Accessibility.can_request());
    }

    #[test]
    fn test_permission_status_methods() {
        assert!(PermissionStatus::Granted.is_granted());
        assert!(PermissionStatus::NotApplicable.is_granted());
        assert!(!PermissionStatus::Denied.is_granted());

        assert!(PermissionStatus::Denied.is_denied());
        assert!(PermissionStatus::Restricted.is_denied());
        assert!(!PermissionStatus::Granted.is_denied());

        assert!(PermissionStatus::NotDetermined.can_request());
        assert!(!PermissionStatus::Granted.can_request());
    }
}

