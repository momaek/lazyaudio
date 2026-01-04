//! 应用状态模块
//!
//! 定义 Tauri 应用的全局状态

use std::sync::Arc;

use crate::storage::StorageEngine;

/// 应用全局状态
#[derive(Debug)]
pub struct AppState {
    /// 存储引擎
    pub storage: Arc<StorageEngine>,
}

impl AppState {
    /// 创建新的应用状态
    ///
    /// # Panics
    /// 如果存储引擎初始化失败会 panic
    #[must_use]
    pub fn new() -> Self {
        let storage = StorageEngine::new().expect("Failed to initialize storage engine");
        Self {
            storage: Arc::new(storage),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
