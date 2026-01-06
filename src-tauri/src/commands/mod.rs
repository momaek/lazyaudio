//! Tauri Commands 模块
//!
//! 定义所有前端可调用的 Tauri 命令

pub mod asr;
pub mod model_events;

// 重新导出事件类型
pub use model_events::{ModelDownloadComplete, ModelDownloadProgress};

// TODO: 在后续 Sprint 中实现
// - session.rs: Session 相关命令
// - audio.rs: 音频相关命令
// - config.rs: 配置相关命令
// - permission.rs: 权限相关命令
// - mode.rs: 模式相关命令
// - ai.rs: AI 相关命令

