//! `LazyAudio` - 桌面实时音频转录应用
//!
//! 核心功能模块:
//! - 本地 AI 语音识别（sherpa-onnx）
//! - 多场景支持（会议、输入法、面试）
//! - LLM 集成（OpenAI/Claude/Ollama）

#![warn(clippy::all, clippy::pedantic)]
#![allow(clippy::module_name_repetitions)]
// Tauri commands 需要 value 参数
#![allow(clippy::needless_pass_by_value)]

// 核心模块
pub mod ai;
pub mod asr;
pub mod audio;
pub mod commands;
pub mod event;
pub mod mode;
pub mod permissions;
pub mod session;
pub mod state;
pub mod storage;
pub mod types;

use state::AppState;
use storage::{AppConfig, SessionAudioConfig, SessionMeta, SessionRecord, TranscriptSegment};
use tauri_specta::{collect_commands, Builder};

// ============================================================================
// Tauri Commands
// ============================================================================

/// 初始化示例命令 - 用于验证 Tauri 命令机制
#[tauri::command]
#[specta::specta]
fn greet(name: &str) -> String {
    format!("你好，{name}！来自 LazyAudio Rust 后端的问候！")
}

/// 获取应用配置
#[tauri::command]
#[specta::specta]
async fn get_config(state: tauri::State<'_, AppState>) -> Result<AppConfig, String> {
    Ok(state.storage.get_config().await)
}

/// 保存应用配置
#[tauri::command]
#[specta::specta]
async fn set_config(state: tauri::State<'_, AppState>, config: AppConfig) -> Result<(), String> {
    state.storage.set_config(config).await.map_err(|e| e.to_string())
}

/// 创建新的 Session
#[tauri::command]
#[specta::specta]
fn create_session(
    state: tauri::State<'_, AppState>,
    mode_id: String,
    name: Option<String>,
    audio_config: Option<SessionAudioConfig>,
) -> Result<SessionMeta, String> {
    let audio_config = audio_config.unwrap_or_default();
    let mut meta = SessionMeta::new(mode_id, audio_config);
    if let Some(n) = name {
        meta.name = Some(n);
    }

    state
        .storage
        .create_session(&meta)
        .map_err(|e| e.to_string())?;

    Ok(meta)
}

/// 获取 Session 元数据
#[tauri::command]
#[specta::specta]
fn get_session(state: tauri::State<'_, AppState>, session_id: String) -> Result<SessionMeta, String> {
    let storage = state
        .storage
        .open_session(&session_id)
        .map_err(|e| e.to_string())?;

    storage.load_meta().map_err(|e| e.to_string())
}

/// 列出历史 Session
#[tauri::command]
#[specta::specta]
fn list_sessions(
    state: tauri::State<'_, AppState>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<SessionRecord>, String> {
    state
        .storage
        .list_sessions(limit, offset)
        .map_err(|e| e.to_string())
}

/// 删除 Session
#[tauri::command]
#[specta::specta]
fn delete_session(state: tauri::State<'_, AppState>, session_id: String) -> Result<(), String> {
    state
        .storage
        .delete_session(&session_id)
        .map_err(|e| e.to_string())
}

/// 获取 Session 转录内容
#[tauri::command]
#[specta::specta]
fn get_transcript(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> Result<Vec<TranscriptSegment>, String> {
    let storage = state
        .storage
        .open_session(&session_id)
        .map_err(|e| e.to_string())?;

    state
        .storage
        .load_transcript(&storage)
        .map_err(|e| e.to_string())
}

// ============================================================================
// Specta Builder
// ============================================================================

/// 构建 Tauri specta 类型导出器
fn build_specta_builder() -> Builder {
    Builder::<tauri::Wry>::new().commands(collect_commands![
        greet,
        get_config,
        set_config,
        create_session,
        get_session,
        list_sessions,
        delete_session,
        get_transcript,
    ])
}

/// 导出 TypeScript 类型定义到前端
///
/// 在开发时会自动生成 `src/types/bindings.ts` 文件
#[cfg(debug_assertions)]
fn export_ts_bindings() {
    use std::path::PathBuf;

    let builder = build_specta_builder();
    let export_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("src/types/bindings.ts");

    // 确保目录存在
    if let Some(parent) = export_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    builder
        .export(
            specta_typescript::Typescript::default()
                .bigint(specta_typescript::BigIntExportBehavior::Number)
                .header("// 此文件由 tauri-specta 自动生成，请勿手动修改\n// @ts-nocheck\n"),
            export_path,
        )
        .expect("Failed to export TypeScript bindings");
}

/// 运行 Tauri 应用
///
/// # Panics
/// 如果应用初始化失败或运行时出错会 panic
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 初始化日志
    tracing_subscriber::fmt::init();

    // 开发模式下导出 TypeScript 类型
    #[cfg(debug_assertions)]
    export_ts_bindings();

    let builder = build_specta_builder();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
