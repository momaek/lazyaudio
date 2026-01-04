//! 应用状态模块
//!
//! 定义 Tauri 应用的全局状态

use std::sync::Arc;
use tokio::sync::RwLock;

use crate::types::AppConfig;

/// 应用全局状态
#[derive(Debug)]
pub struct AppState {
    /// 应用配置
    pub config: Arc<RwLock<AppConfig>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            config: Arc::new(RwLock::new(AppConfig::default())),
        }
    }
}

impl AppState {
    /// 创建新的应用状态
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }
}

