//! macOS 平台权限实现
//!
//! 使用 macOS 系统 API 检查和请求权限

use super::types::PermissionStatus;
use std::process::Command;

/// 检查系统音频录制权限
///
/// 使用 `CGPreflightScreenCaptureAccess` API 检查权限状态。
/// macOS 14.4+ 允许用户在「录屏与系统录音」设置中选择「仅录音」选项。
/// 此 API 同时检查屏幕录制和系统音频录制权限。
pub fn check_system_audio_recording_permission() -> PermissionStatus {
    // 使用 AppleScript 调用系统 API 检查权限
    // CGPreflightScreenCaptureAccess() 返回 true 表示已授权（包括仅音频录制）
    let output = Command::new("osascript")
        .arg("-e")
        .arg(
            r#"
            use framework "CoreGraphics"
            
            set hasAccess to current application's CGPreflightScreenCaptureAccess() as boolean
            if hasAccess then
                return "granted"
            else
                return "denied"
            end if
            "#,
        )
        .output();

    match output {
        Ok(output) => {
            let result = String::from_utf8_lossy(&output.stdout).trim().to_lowercase();
            if result.contains("granted") {
                PermissionStatus::Granted
            } else {
                // macOS 不区分 NotDetermined 和 Denied，首次检查也返回 denied
                PermissionStatus::Denied
            }
        }
        Err(e) => {
            tracing::error!("检查系统音频录制权限失败: {}", e);
            PermissionStatus::NotDetermined
        }
    }
}

/// 请求系统音频录制权限
///
/// 触发系统权限请求对话框。用户需要在系统设置中手动授权。
/// macOS 14.4+ 用户可以选择「仅录音」而不需要授予完整的屏幕录制权限。
/// 返回当前权限状态（不一定是授权后的状态）。
pub fn request_system_audio_recording_permission() -> PermissionStatus {
    // CGRequestScreenCaptureAccess() 会触发系统权限请求
    let _ = Command::new("osascript")
        .arg("-e")
        .arg(
            r#"
            use framework "CoreGraphics"
            current application's CGRequestScreenCaptureAccess()
            "#,
        )
        .output();

    // 请求后重新检查权限状态
    check_system_audio_recording_permission()
}

/// 检查麦克风权限
///
/// 使用 `AVCaptureDevice.authorizationStatus` API 检查权限状态。
pub fn check_microphone_permission() -> PermissionStatus {
    let output = Command::new("osascript")
        .arg("-e")
        .arg(
            r#"
            use framework "AVFoundation"
            
            set authStatus to current application's AVCaptureDevice's authorizationStatusForMediaType:(current application's AVMediaTypeAudio)
            
            if authStatus is 0 then
                return "notDetermined"
            else if authStatus is 1 then
                return "restricted"
            else if authStatus is 2 then
                return "denied"
            else if authStatus is 3 then
                return "granted"
            else
                return "unknown"
            end if
            "#,
        )
        .output();

    match output {
        Ok(output) => {
            let result = String::from_utf8_lossy(&output.stdout).trim().to_lowercase();
            if result.contains("granted") {
                PermissionStatus::Granted
            } else if result.contains("denied") {
                PermissionStatus::Denied
            } else if result.contains("restricted") {
                PermissionStatus::Restricted
            } else if result.contains("notdetermined") {
                PermissionStatus::NotDetermined
            } else {
                PermissionStatus::NotDetermined
            }
        }
        Err(e) => {
            tracing::error!("检查麦克风权限失败: {}", e);
            PermissionStatus::NotDetermined
        }
    }
}

/// 请求麦克风权限
///
/// 触发系统麦克风权限请求对话框。
/// 这是一个异步操作，但我们使用同步方式等待结果。
pub fn request_microphone_permission() -> PermissionStatus {
    let output = Command::new("osascript")
        .arg("-e")
        .arg(
            r#"
            use framework "AVFoundation"
            use scripting additions
            
            set resultStatus to "pending"
            
            current application's AVCaptureDevice's requestAccessForMediaType:(current application's AVMediaTypeAudio) completionHandler:(missing value)
            
            -- 等待一小段时间让权限对话框显示
            delay 0.5
            
            -- 重新检查权限状态
            set authStatus to current application's AVCaptureDevice's authorizationStatusForMediaType:(current application's AVMediaTypeAudio)
            
            if authStatus is 3 then
                return "granted"
            else if authStatus is 2 then
                return "denied"
            else if authStatus is 1 then
                return "restricted"
            else
                return "notDetermined"
            end if
            "#,
        )
        .output();

    match output {
        Ok(output) => {
            let result = String::from_utf8_lossy(&output.stdout).trim().to_lowercase();
            if result.contains("granted") {
                PermissionStatus::Granted
            } else if result.contains("denied") {
                PermissionStatus::Denied
            } else if result.contains("restricted") {
                PermissionStatus::Restricted
            } else {
                PermissionStatus::NotDetermined
            }
        }
        Err(e) => {
            tracing::error!("请求麦克风权限失败: {}", e);
            check_microphone_permission()
        }
    }
}

/// 检查辅助功能权限
///
/// 使用 `AXIsProcessTrusted` API 检查权限状态。
/// 辅助功能权限只能检查，不能程序化请求。
pub fn check_accessibility_permission() -> PermissionStatus {
    let output = Command::new("osascript")
        .arg("-e")
        .arg(
            r#"
            use framework "ApplicationServices"
            
            set isTrusted to current application's AXIsProcessTrusted() as boolean
            if isTrusted then
                return "granted"
            else
                return "denied"
            end if
            "#,
        )
        .output();

    match output {
        Ok(output) => {
            let result = String::from_utf8_lossy(&output.stdout).trim().to_lowercase();
            if result.contains("granted") {
                PermissionStatus::Granted
            } else {
                PermissionStatus::Denied
            }
        }
        Err(e) => {
            tracing::error!("检查辅助功能权限失败: {}", e);
            PermissionStatus::NotDetermined
        }
    }
}

/// 打开系统偏好设置的权限页面
///
/// # Arguments
/// * `permission` - 要打开设置的权限类型
pub fn open_permission_settings(permission: super::types::PermissionType) -> Result<(), String> {
    use super::types::PermissionType;

    // macOS 14+ 使用新的设置 URL，「录屏与系统录音」在同一个位置
    // 用户可以在此处选择「仅录音」或「录屏和录音」
    let url = match permission {
        PermissionType::SystemAudioRecording => {
            // 打开「录屏与系统录音」设置页面
            "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
        }
        PermissionType::Microphone => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
        }
        PermissionType::Accessibility => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
        }
    };

    let status = Command::new("open").arg(url).status();

    match status {
        Ok(exit_status) => {
            if exit_status.success() {
                Ok(())
            } else {
                Err(format!("打开设置失败，退出码: {:?}", exit_status.code()))
            }
        }
        Err(e) => Err(format!("执行 open 命令失败: {}", e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_check_system_audio_recording_permission() {
        // 只验证函数能正常执行，不验证具体结果（取决于系统权限状态）
        let status = check_system_audio_recording_permission();
        assert!(matches!(
            status,
            PermissionStatus::Granted | PermissionStatus::Denied | PermissionStatus::NotDetermined
        ));
    }

    #[test]
    fn test_check_microphone_permission() {
        let status = check_microphone_permission();
        assert!(matches!(
            status,
            PermissionStatus::Granted
                | PermissionStatus::Denied
                | PermissionStatus::NotDetermined
                | PermissionStatus::Restricted
        ));
    }

    #[test]
    fn test_check_accessibility_permission() {
        let status = check_accessibility_permission();
        assert!(matches!(
            status,
            PermissionStatus::Granted | PermissionStatus::Denied | PermissionStatus::NotDetermined
        ));
    }
}
