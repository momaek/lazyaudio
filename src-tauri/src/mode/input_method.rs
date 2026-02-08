//! 输入法模式实现
//!
//! 提供全局快捷键、悬浮窗、麦克风抢占和实时识别文本管理

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tracing::{info, warn};

use crate::event::{AppEvent, EmptyPayload, SharedEventBus, TextPayload};
use crate::session::{SessionConfig, SessionId};
use crate::state::AppState;
use crate::storage::StorageEngine;

// ============================================================================
// 配置与状态
// ============================================================================

/// 输入法模式配置
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct InputMethodModeConfig {
    pub input_method: InputMethod,
    pub confirm_before_input: bool,
    pub silence_timeout_ms: u64,
    pub max_duration_ms: u64,
    pub auto_punctuation: bool,
    pub shortcut: String,
}

impl Default for InputMethodModeConfig {
    fn default() -> Self {
        Self {
            input_method: InputMethod::Clipboard,
            confirm_before_input: true,
            silence_timeout_ms: 3000,
            max_duration_ms: 60_000,
            auto_punctuation: true,
            shortcut: "CommandOrControl+Shift+Space".to_string(),
        }
    }
}

/// 输入方式
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum InputMethod {
    Clipboard,
    KeyboardSimulation,
}

/// 输入法模式状态
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InputMethodState {
    Idle,
    Activating,
    Listening,
    Confirming,
    Inputting,
    Canceling,
    Cleanup,
}

// ============================================================================
// 输入法模式管理器
// ============================================================================

/// 输入法模式管理器
#[derive(Debug)]
pub struct InputMethodManager {
    state: RwLock<InputMethodState>,
    confirmed_text: RwLock<String>,
    partial_text: RwLock<String>,
    session_id: RwLock<Option<SessionId>>,
    config: RwLock<InputMethodModeConfig>,
    event_bus: SharedEventBus,
    session_manager: crate::session::SharedSessionManager,
    session_runtime: crate::session::SharedSessionRuntimeManager,
    storage: Arc<StorageEngine>,
    active_flag: Mutex<Option<Arc<AtomicBool>>>,
    last_text_at: RwLock<Option<Instant>>,
    activated_at: RwLock<Option<Instant>>,
    app_handle: RwLock<Option<AppHandle>>,
}

/// 共享输入法管理器类型
pub type SharedInputMethodManager = Arc<InputMethodManager>;

/// 创建共享输入法管理器
#[must_use]
pub fn create_shared_input_method_manager(
    event_bus: SharedEventBus,
    session_manager: crate::session::SharedSessionManager,
    session_runtime: crate::session::SharedSessionRuntimeManager,
    storage: Arc<StorageEngine>,
) -> SharedInputMethodManager {
    Arc::new(InputMethodManager::new(
        event_bus,
        session_manager,
        session_runtime,
        storage,
    ))
}

impl InputMethodManager {
    #[must_use]
    pub fn new(
        event_bus: SharedEventBus,
        session_manager: crate::session::SharedSessionManager,
        session_runtime: crate::session::SharedSessionRuntimeManager,
        storage: Arc<StorageEngine>,
    ) -> Self {
        Self {
            state: RwLock::new(InputMethodState::Idle),
            confirmed_text: RwLock::new(String::new()),
            partial_text: RwLock::new(String::new()),
            session_id: RwLock::new(None),
            config: RwLock::new(InputMethodModeConfig::default()),
            event_bus,
            session_manager,
            session_runtime,
            storage,
            active_flag: Mutex::new(None),
            last_text_at: RwLock::new(None),
            activated_at: RwLock::new(None),
            app_handle: RwLock::new(None),
        }
    }

    pub fn state(&self) -> InputMethodState {
        *self.state.read().expect("获取 state 锁失败")
    }

    pub fn current_text(&self) -> String {
        let confirmed = self.confirmed_text.read().expect("获取 confirmed 锁失败");
        let partial = self.partial_text.read().expect("获取 partial 锁失败");
        format!("{confirmed}{partial}")
    }

    pub async fn toggle(self: &Arc<Self>, app: AppHandle) -> Result<(), String> {
        if self.state() == InputMethodState::Idle {
            self.activate(app).await
        } else {
            self.cancel(app).await
        }
    }

    pub async fn activate(self: &Arc<Self>, app: AppHandle) -> Result<(), String> {
        if self.state() != InputMethodState::Idle {
            return Ok(());
        }

        self.set_state(InputMethodState::Activating);
        self.clear_text();
        self.set_app_handle(app.clone());

        let config = SessionConfig::input_method();
        let session_id = self
            .session_manager
            .create(config)
            .map_err(|e| e.to_string())?;

        self.session_manager
            .start(&session_id)
            .map_err(|e| e.to_string())?;

        let app_config = self.storage.get_config().await;

        self.session_runtime
            .start(
                session_id.clone(),
                true,
                false,
                false,
                app_config.asr.vad_sensitivity,
                None,
                None,
                Some(app.clone()),
                None,  // 输入法模式使用全局 ASR Provider
                Some(app_config.asr.clone()),
            )
            .map_err(|e| e.to_string())?;

        self.show_window(&app)?;

        {
            let mut active_id = self.session_id.write().expect("获取 session_id 锁失败");
            *active_id = Some(session_id.clone());
        }

        self.set_state(InputMethodState::Listening);
        self.event_bus.publish(AppEvent::InputMethodActivated(EmptyPayload::default()));

        let active_flag = Arc::new(AtomicBool::new(true));
        self.set_active_flag(active_flag.clone());
        self.start_event_listener(session_id.clone(), active_flag.clone());
        self.start_timeout_watcher(session_id, active_flag);

        Ok(())
    }

    pub async fn confirm(self: &Arc<Self>, app: AppHandle) -> Result<(), String> {
        if self.state() == InputMethodState::Idle {
            return Ok(());
        }

        self.set_state(InputMethodState::Confirming);

        let text = self.current_text();
        if text.trim().is_empty() {
            self.cancel(app).await?;
            return Ok(());
        }

        self.set_state(InputMethodState::Inputting);

        let config = self.config.read().expect("获取 config 锁失败").clone();
        match config.input_method {
            InputMethod::Clipboard => {
                app.clipboard()
                    .write_text(text.clone())
                    .map_err(|e| format!("复制到剪贴板失败: {e}"))?;
            }
            InputMethod::KeyboardSimulation => {
                warn!("键盘模拟输入尚未实现，已回退为剪贴板方式");
                app.clipboard()
                    .write_text(text.clone())
                    .map_err(|e| format!("复制到剪贴板失败: {e}"))?;
            }
        }

        self.event_bus
            .publish(AppEvent::InputMethodConfirmed(TextPayload::new(text)));

        self.cleanup(app).await
    }

    pub async fn cancel(self: &Arc<Self>, app: AppHandle) -> Result<(), String> {
        if self.state() == InputMethodState::Idle {
            return Ok(());
        }

        self.set_state(InputMethodState::Canceling);
        self.event_bus
            .publish(AppEvent::InputMethodCancelled(EmptyPayload::default()));

        self.cleanup(app).await
    }

    async fn cleanup(self: &Arc<Self>, app: AppHandle) -> Result<(), String> {
        self.set_state(InputMethodState::Cleanup);

        self.stop_active_tasks();

        if let Some(session_id) = self.take_session_id() {
            let _ = self.session_runtime.stop(&session_id);
            let _ = self.session_manager.stop(&session_id);
        }

        self.hide_window(&app)?;
        self.clear_text();
        self.set_state(InputMethodState::Idle);
        Ok(())
    }

    fn set_state(&self, state: InputMethodState) {
        let mut current = self.state.write().expect("获取 state 锁失败");
        *current = state;
    }

    fn set_app_handle(&self, app: AppHandle) {
        let mut handle = self.app_handle.write().expect("获取 app_handle 锁失败");
        *handle = Some(app);
    }

    fn app_handle(&self) -> Option<AppHandle> {
        self.app_handle
            .read()
            .expect("获取 app_handle 锁失败")
            .clone()
    }

    fn clear_text(&self) {
        *self.confirmed_text.write().expect("获取 confirmed 锁失败") = String::new();
        *self.partial_text.write().expect("获取 partial 锁失败") = String::new();
        *self.last_text_at.write().expect("获取 last_text_at 锁失败") = None;
        *self.activated_at.write().expect("获取 activated_at 锁失败") = Some(Instant::now());
    }

    fn set_partial_text(&self, text: String) {
        *self.partial_text.write().expect("获取 partial 锁失败") = text;
        *self.last_text_at.write().expect("获取 last_text_at 锁失败") = Some(Instant::now());

        let combined = self.current_text();
        self.event_bus
            .publish(AppEvent::InputMethodTextChanged(TextPayload::new(combined)));
    }

    fn append_final_text(&self, text: String) {
        let mut confirmed = self.confirmed_text.write().expect("获取 confirmed 锁失败");
        confirmed.push_str(&text);
        *self.partial_text.write().expect("获取 partial 锁失败") = String::new();
        *self.last_text_at.write().expect("获取 last_text_at 锁失败") = Some(Instant::now());

        let combined = self.current_text();
        self.event_bus
            .publish(AppEvent::InputMethodTextChanged(TextPayload::new(combined)));
    }

    fn take_session_id(&self) -> Option<SessionId> {
        self.session_id.write().expect("获取 session_id 锁失败").take()
    }

    fn start_event_listener(self: &Arc<Self>, session_id: SessionId, active_flag: Arc<AtomicBool>) {
        let event_bus = self.event_bus.clone();
        let manager = self.clone();

        tauri::async_runtime::spawn(async move {
            let mut receiver = event_bus.subscribe();
            loop {
                if !active_flag.load(Ordering::SeqCst) {
                    break;
                }

                let event = match receiver.recv().await {
                    Ok(event) => event,
                    Err(_) => break,
                };

                match event {
                    AppEvent::TranscriptPartial(payload)
                        if payload.session_id == session_id =>
                    {
                        manager.set_partial_text(payload.text);
                    }
                    AppEvent::TranscriptFinal(payload)
                        if payload.session_id == session_id =>
                    {
                        manager.append_final_text(payload.segment.text);
                    }
                    AppEvent::SessionEnded(payload) if payload.session_id == session_id => {
                        break;
                    }
                    _ => {}
                }
            }
        });
    }

    fn start_timeout_watcher(self: &Arc<Self>, _session_id: SessionId, active_flag: Arc<AtomicBool>) {
        let manager = self.clone();

        tauri::async_runtime::spawn(async move {
            let tick = Duration::from_millis(200);
            loop {
                if !active_flag.load(Ordering::SeqCst) {
                    break;
                }

                if manager.state() != InputMethodState::Listening {
                    tokio::time::sleep(tick).await;
                    continue;
                }

                let now = Instant::now();
                let (silence_timeout, max_duration) = {
                    let config = manager.config.read().expect("获取 config 锁失败");
                    (config.silence_timeout_ms, config.max_duration_ms)
                };

                let activated_at = *manager
                    .activated_at
                    .read()
                    .expect("获取 activated_at 锁失败");
                if let Some(activated_at) = activated_at {
                    if now.duration_since(activated_at).as_millis() as u64 >= max_duration {
                        if let Some(app) = manager.app_handle() {
                            let _ = manager.confirm(app).await;
                        }
                        break;
                    }
                }

                let last_text_at = *manager
                    .last_text_at
                    .read()
                    .expect("获取 last_text_at 锁失败");
                if let Some(last_text_at) = last_text_at {
                    if now.duration_since(last_text_at).as_millis() as u64 >= silence_timeout {
                        if let Some(app) = manager.app_handle() {
                            let _ = manager.cancel(app).await;
                        }
                        break;
                    }
                }

                tokio::time::sleep(tick).await;
            }
        });
    }

    fn stop_active_tasks(&self) {
        if let Some(flag) = self.active_flag.lock().expect("获取 active_flag 锁失败").take() {
            flag.store(false, Ordering::SeqCst);
        }
    }

    fn set_active_flag(&self, flag: Arc<AtomicBool>) {
        let mut holder = self.active_flag.lock().expect("获取 active_flag 锁失败");
        *holder = Some(flag);
    }

    fn show_window(&self, app: &AppHandle) -> Result<(), String> {
        let label = "input-method";
        let window = match app.get_webview_window(label) {
            Some(window) => window,
            None => {
                let window = WebviewWindowBuilder::new(
                    app,
                    label,
                    WebviewUrl::App("/floating/input-method".into()),
                )
                .title("语音输入")
                .inner_size(420.0, 160.0)
                .resizable(false)
                .decorations(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .visible(false)
                .build()
                .map_err(|e| format!("创建输入法窗口失败: {e}"))?;
                window
            }
        };

        window
            .show()
            .map_err(|e| format!("显示输入法窗口失败: {e}"))?;
        window
            .set_focus()
            .map_err(|e| format!("聚焦输入法窗口失败: {e}"))?;

        Ok(())
    }

    fn hide_window(&self, app: &AppHandle) -> Result<(), String> {
        if let Some(window) = app.get_webview_window("input-method") {
            window
                .hide()
                .map_err(|e| format!("隐藏输入法窗口失败: {e}"))?;
        }
        Ok(())
    }
}

// ============================================================================
// 快捷键注册
// ============================================================================
pub fn register_input_method_shortcut<F>(
    app: &AppHandle,
    shortcut: &str,
    callback: F,
) -> Result<(), String>
where
    F: Fn() + Send + Sync + 'static,
{
    let shortcut = shortcut
        .parse::<Shortcut>()
        .map_err(|e| format!("解析快捷键失败: {e}"))?;
    app.global_shortcut()
        .on_shortcut(shortcut, move |_, _, _| {
            callback();
        })
        .map_err(|e| format!("注册快捷键失败: {e}"))?;
    Ok(())
}

// ============================================================================
// AppState 辅助
// ============================================================================

pub fn register_input_method_shortcut_from_state(app: &AppHandle, state: &AppState) {
    let app_handle = app.clone();
    let manager = state.input_method.clone();
    let storage = state.storage.clone();

    tauri::async_runtime::spawn(async move {
        let config = storage.get_config().await;
        let shortcut = config.hotkeys.input_method_toggle;
        let app_handle_for_register = app_handle.clone();
        if let Err(err) = register_input_method_shortcut(&app_handle_for_register, &shortcut, move || {
            let app_handle = app_handle.clone();
            let manager = manager.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = manager.toggle(app_handle.clone()).await {
                    warn!("输入法模式切换失败: {}", error);
                }
            });
        }) {
            warn!("注册输入法快捷键失败: {}", err);
        } else {
            info!("输入法快捷键已注册: {}", shortcut);
        }
    });
}
