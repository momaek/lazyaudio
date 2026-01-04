//! `LazyAudio` - 桌面实时音频转录应用
//!
//! 核心功能模块:
//! - 本地 AI 语音识别（sherpa-onnx）
//! - 多场景支持（会议、输入法、面试）
//! - LLM 集成（OpenAI/Claude/Ollama）

#![warn(clippy::all, clippy::pedantic)]
#![allow(clippy::module_name_repetitions)]

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
use tauri_specta::{collect_commands, Builder};

/// 初始化示例命令 - 用于验证 Tauri 命令机制
#[tauri::command]
#[specta::specta]
fn greet(name: &str) -> String {
    format!("你好，{name}！来自 LazyAudio Rust 后端的问候！")
}

/// 获取应用配置
#[tauri::command]
#[specta::specta]
async fn get_config(
    state: tauri::State<'_, AppState>,
) -> Result<types::AppConfig, String> {
    let config = state.config.read().await;
    Ok(config.clone())
}

/// 构建 Tauri specta 类型导出器
fn build_specta_builder() -> Builder {
    Builder::<tauri::Wry>::new()
        .commands(collect_commands![greet, get_config])
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
