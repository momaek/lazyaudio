//! 权限管理模块
//!
//! 管理系统权限（麦克风、屏幕录制、辅助功能等）
//!
//! ## 平台差异
//! - macOS: 需要屏幕录制、麦克风、辅助功能权限
//! - Windows: 只需要麦克风权限

mod manager;
mod types;

#[cfg(target_os = "macos")]
mod macos;

#[cfg(target_os = "windows")]
mod windows;

pub use manager::PermissionManager;
pub use types::{AllPermissionsStatus, PermissionStatus, PermissionType};
