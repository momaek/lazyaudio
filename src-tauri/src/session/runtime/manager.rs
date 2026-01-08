use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use std::thread::JoinHandle;

use tracing::{info, warn};

use crate::asr::AsrEngine;
use crate::event::SharedEventBus;
use crate::session::types::SessionId;

use super::audio_loop::run_session_audio;

/// 运行中的 Session 句柄
#[derive(Debug)]
pub struct SessionRuntime {
    /// Session ID
    pub session_id: SessionId,
    /// 是否正在运行
    is_running: Arc<AtomicBool>,
    /// 是否暂停
    is_paused: Arc<AtomicBool>,
    /// 工作线程句柄
    thread_handle: Option<JoinHandle<()>>,
}

impl SessionRuntime {
    /// 停止运行时
    pub fn stop(&mut self) {
        info!(session_id = %self.session_id, "停止 Session 运行时");
        self.is_running.store(false, Ordering::SeqCst);
        
        if let Some(handle) = self.thread_handle.take() {
            let _ = handle.join();
        }
    }

    /// 暂停
    pub fn pause(&self) {
        info!(session_id = %self.session_id, "暂停 Session 运行时");
        self.is_paused.store(true, Ordering::SeqCst);
    }

    /// 恢复
    pub fn resume(&self) {
        info!(session_id = %self.session_id, "恢复 Session 运行时");
        self.is_paused.store(false, Ordering::SeqCst);
    }

    /// 是否正在运行
    pub fn is_running(&self) -> bool {
        self.is_running.load(Ordering::SeqCst)
    }

    /// 是否暂停
    pub fn is_paused(&self) -> bool {
        self.is_paused.load(Ordering::SeqCst)
    }
}

impl Drop for SessionRuntime {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Session 运行时管理器
#[derive(Debug)]
pub struct SessionRuntimeManager {
    /// 运行中的 Session
    runtimes: RwLock<HashMap<SessionId, SessionRuntime>>,
    /// 事件总线
    event_bus: SharedEventBus,
    /// ASR 引擎
    asr_engine: Arc<RwLock<AsrEngine>>,
}

impl SessionRuntimeManager {
    /// 创建新的运行时管理器
    pub fn new(event_bus: SharedEventBus, asr_engine: Arc<RwLock<AsrEngine>>) -> Self {
        Self {
            runtimes: RwLock::new(HashMap::new()),
            event_bus,
            asr_engine,
        }
    }

    /// 启动 Session 运行时
    pub fn start(
        &self,
        session_id: SessionId,
        use_microphone: bool,
        use_system_audio: bool,
        merge_for_asr: bool,
        vad_sensitivity: f32,
        mic_id: Option<String>,
        system_source_id: Option<String>,
        app_handle: Option<tauri::AppHandle>,
    ) -> Result<(), String> {
        // 检查是否已在运行
        {
            let runtimes = self.runtimes.read().expect("获取锁失败");
            if runtimes.contains_key(&session_id) {
                return Err("Session 运行时已存在".to_string());
            }
        }

        let is_running = Arc::new(AtomicBool::new(true));
        let is_paused = Arc::new(AtomicBool::new(false));
        let is_running_clone = is_running.clone();
        let is_paused_clone = is_paused.clone();
        
        let session_id_clone = session_id.clone();
        let event_bus = self.event_bus.clone();
        let asr_engine_clone = self.asr_engine.clone();

        // 在独立线程中运行音频采集
        // 注意：StreamingRecognizer 必须在同一线程中创建和使用（FFI 对象可能不支持跨线程移动）
        let thread_handle = std::thread::spawn(move || {
            // 在工作线程中创建识别器（避免跨线程移动 FFI 对象）
            let recognizer = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let engine = asr_engine_clone.read().expect("获取 ASR 锁失败");
                engine.create_recognizer().ok()
            }))
            .ok()
            .flatten();

            if recognizer.is_some() {
                info!("ASR 识别器创建成功");
            } else {
                warn!("ASR 识别器创建失败，转录功能将不可用（可能需要重新下载模型）");
            }

            run_session_audio(
                session_id_clone,
                is_running_clone,
                is_paused_clone,
                use_microphone,
                use_system_audio,
                merge_for_asr,
                vad_sensitivity,
                mic_id,
                system_source_id,
                event_bus,
                asr_engine_clone,
                recognizer,
                app_handle,
            );
        });

        // 存储运行时句柄
        let runtime = SessionRuntime {
            session_id: session_id.clone(),
            is_running,
            is_paused,
            thread_handle: Some(thread_handle),
        };

        let mut runtimes = self.runtimes.write().expect("获取锁失败");
        runtimes.insert(session_id, runtime);

        Ok(())
    }

    /// 停止 Session 运行时
    pub fn stop(&self, session_id: &SessionId) -> Result<(), String> {
        let mut runtimes = self.runtimes.write().expect("获取锁失败");
        if let Some(mut runtime) = runtimes.remove(session_id) {
            runtime.stop();
            Ok(())
        } else {
            Err("Session 运行时不存在".to_string())
        }
    }

    /// 暂停 Session 运行时
    pub fn pause(&self, session_id: &SessionId) -> Result<(), String> {
        let runtimes = self.runtimes.read().expect("获取锁失败");
        if let Some(runtime) = runtimes.get(session_id) {
            runtime.pause();
            Ok(())
        } else {
            Err("Session 运行时不存在".to_string())
        }
    }

    /// 恢复 Session 运行时
    pub fn resume(&self, session_id: &SessionId) -> Result<(), String> {
        let runtimes = self.runtimes.read().expect("获取锁失败");
        if let Some(runtime) = runtimes.get(session_id) {
            runtime.resume();
            Ok(())
        } else {
            Err("Session 运行时不存在".to_string())
        }
    }

    /// 检查 Session 运行时是否存在
    pub fn exists(&self, session_id: &SessionId) -> bool {
        self.runtimes.read().expect("获取锁失败").contains_key(session_id)
    }

    /// 停止所有运行时
    pub fn stop_all(&self) {
        let mut runtimes = self.runtimes.write().expect("获取锁失败");
        for (_, mut runtime) in runtimes.drain() {
            runtime.stop();
        }
    }
}

/// 共享运行时管理器类型
pub type SharedSessionRuntimeManager = Arc<SessionRuntimeManager>;

/// 创建共享运行时管理器
pub fn create_shared_runtime_manager(
    event_bus: SharedEventBus,
    asr_engine: Arc<RwLock<AsrEngine>>,
) -> SharedSessionRuntimeManager {
    Arc::new(SessionRuntimeManager::new(event_bus, asr_engine))
}
