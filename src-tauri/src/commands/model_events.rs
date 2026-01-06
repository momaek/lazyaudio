//! 模型下载相关事件

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri_specta::Event;

/// 模型下载进度事件
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct ModelDownloadProgress {
    /// 模型 ID
    pub model_id: String,
    /// 已下载字节数
    pub downloaded: u64,
    /// 总字节数
    pub total: u64,
    /// 下载进度（0-100）
    pub progress: f64,
}

/// 模型下载完成事件
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct ModelDownloadComplete {
    /// 模型 ID
    pub model_id: String,
    /// 是否成功
    pub success: bool,
    /// 错误信息（如果失败）
    pub error: Option<String>,
}

