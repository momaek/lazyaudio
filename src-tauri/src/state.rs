//! 应用状态模块
//!
//! 定义 Tauri 应用的全局状态

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use crate::audio::SharedLevel;
use crate::storage::StorageEngine;

/// 音频测试状态
#[derive(Debug)]
pub struct AudioTestState {
    /// 是否正在采集
    pub is_running: Arc<AtomicBool>,
    /// 共享音量电平
    pub level: SharedLevel,
}

impl AudioTestState {
    /// 创建新的音频测试状态
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(AtomicBool::new(false)),
            level: SharedLevel::new(),
        }
    }

    /// 检查是否正在运行
    pub fn running(&self) -> bool {
        self.is_running.load(Ordering::SeqCst)
    }

    /// 设置运行状态
    pub fn set_running(&self, running: bool) {
        self.is_running.store(running, Ordering::SeqCst);
    }
}

impl Default for AudioTestState {
    fn default() -> Self {
        Self::new()
    }
}

/// 应用全局状态
#[derive(Debug)]
pub struct AppState {
    /// 存储引擎
    pub storage: Arc<StorageEngine>,
    /// 音频测试状态
    pub audio_test: AudioTestState,
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
            audio_test: AudioTestState::new(),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
