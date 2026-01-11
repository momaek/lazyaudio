//! 应用状态模块
//!
//! 定义 Tauri 应用的全局状态

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use crate::asr::AsrEngine;
use crate::audio::{
    create_shared_microphone_manager_with_bus, AudioSource, SharedLevel, SharedMicrophoneManager,
};
use crate::event::{create_shared_event_bus, SharedEventBus};
use crate::mode::input_method::{create_shared_input_method_manager, SharedInputMethodManager};
use crate::session::{
    create_shared_runtime_manager, SessionManager, SharedSessionManager,
    SharedSessionRuntimeManager,
};
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

/// 音频源缓存
#[derive(Debug)]
pub struct AudioSourceCache {
    /// 系统音频源列表
    system_sources: RwLock<Vec<AudioSource>>,
    /// 上次更新时间
    last_updated: RwLock<Option<Instant>>,
    /// 缓存有效期（默认 5 分钟）
    cache_duration: Duration,
}

impl AudioSourceCache {
    /// 创建新的缓存
    pub fn new() -> Self {
        Self {
            system_sources: RwLock::new(Vec::new()),
            last_updated: RwLock::new(None),
            cache_duration: Duration::from_secs(300), // 5 分钟
        }
    }

    /// 获取缓存的系统音频源
    pub fn get_system_sources(&self) -> Option<Vec<AudioSource>> {
        let last_updated = self.last_updated.read().ok()?;
        if let Some(time) = *last_updated {
            if time.elapsed() < self.cache_duration {
                return self.system_sources.read().ok().map(|s| s.clone());
            }
        }
        None
    }

    /// 更新系统音频源缓存
    pub fn set_system_sources(&self, sources: Vec<AudioSource>) {
        if let Ok(mut cache) = self.system_sources.write() {
            *cache = sources;
        }
        if let Ok(mut time) = self.last_updated.write() {
            *time = Some(Instant::now());
        }
    }

    /// 清除缓存
    pub fn clear(&self) {
        if let Ok(mut cache) = self.system_sources.write() {
            cache.clear();
        }
        if let Ok(mut time) = self.last_updated.write() {
            *time = None;
        }
    }

    /// 检查缓存是否有效
    pub fn is_valid(&self) -> bool {
        self.get_system_sources().is_some()
    }
}

impl Default for AudioSourceCache {
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
    /// ASR 引擎
    pub asr_engine: Arc<RwLock<AsrEngine>>,
    /// 事件总线
    pub event_bus: SharedEventBus,
    /// 麦克风管理器
    pub microphone_manager: SharedMicrophoneManager,
    /// Session 管理器
    pub session_manager: SharedSessionManager,
    /// Session 运行时管理器
    pub session_runtime: SharedSessionRuntimeManager,
    /// 输入法模式管理器
    pub input_method: SharedInputMethodManager,
    /// 音频源缓存
    pub audio_source_cache: AudioSourceCache,
}

impl AppState {
    /// 创建新的应用状态
    ///
    /// # Panics
    /// 如果存储引擎初始化失败会 panic
    #[must_use]
    pub fn new() -> Self {
        let storage = Arc::new(
            StorageEngine::new().expect("Failed to initialize storage engine"),
        );
        
        // 初始化 ASR 引擎
        let models_dir =
            crate::storage::get_models_dir().expect("Failed to get models directory");
        let mut asr_engine = AsrEngine::with_defaults(models_dir);

        // 尝试加载已下载的模型
        let default_models = [
            "sherpa-onnx-streaming-zipformer-zh-14M-2023-02-23",
            "sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20",
            "sherpa-onnx-streaming-zipformer-en-20M-2023-02-17",
        ];
        
        let mut model_loaded = false;
        for model_id in default_models {
            if asr_engine.is_model_available(model_id) {
                match asr_engine.load_model(model_id) {
                    Ok(_) => {
                        tracing::info!("默认 ASR 模型已加载: {}", model_id);
                        model_loaded = true;
                        break;
                    }
                    Err(e) => {
                        tracing::warn!("加载 ASR 模型失败: {}: {}", model_id, e);
                    }
                }
            }
        }
        
        if !model_loaded {
            tracing::warn!("没有可用的 ASR 模型，请在设置中下载模型");
        }

        // 创建事件总线
        let event_bus = create_shared_event_bus();

        // 创建麦克风管理器（带事件总线）
        let microphone_manager = create_shared_microphone_manager_with_bus(event_bus.clone());

        // 创建 Session 管理器
        let session_manager = Arc::new(SessionManager::new(
            storage.clone(),
            event_bus.clone(),
            microphone_manager.clone(),
        ));

        // 创建 ASR 引擎的 Arc
        let asr_engine_arc = Arc::new(RwLock::new(asr_engine));

        // 创建 Session 运行时管理器
        let session_runtime = create_shared_runtime_manager(
            event_bus.clone(),
            asr_engine_arc.clone(),
        );

        let input_method = create_shared_input_method_manager(
            event_bus.clone(),
            session_manager.clone(),
            session_runtime.clone(),
            storage.clone(),
        );
        
        Self {
            storage,
            audio_test: AudioTestState::new(),
            asr_engine: asr_engine_arc,
            event_bus,
            microphone_manager,
            session_manager,
            session_runtime,
            input_method,
            audio_source_cache: AudioSourceCache::new(),
        }
    }

    /// 获取事件总线引用
    #[must_use]
    pub fn event_bus(&self) -> &SharedEventBus {
        &self.event_bus
    }

    /// 获取麦克风管理器引用
    #[must_use]
    pub fn microphone_manager(&self) -> &SharedMicrophoneManager {
        &self.microphone_manager
    }

    /// 获取 Session 管理器引用
    #[must_use]
    pub fn session_manager(&self) -> &SharedSessionManager {
        &self.session_manager
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
