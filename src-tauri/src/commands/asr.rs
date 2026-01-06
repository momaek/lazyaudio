//! ASR 相关命令

use crate::asr::{ModelDownloader, ModelInfo};
use crate::commands::model_events::ModelDownloadComplete;
use crate::state::AppState;
use tauri::{AppHandle, Emitter, State};

/// 列出所有可用的 ASR 模型
#[tauri::command]
#[specta::specta]
pub async fn list_asr_models(state: State<'_, AppState>) -> Result<Vec<ModelInfo>, String> {
    let engine = state
        .asr_engine
        .read()
        .map_err(|e| format!("无法获取 ASR 引擎: {}", e))?;

    Ok(engine.list_models())
}

/// 检查模型是否已下载
#[tauri::command]
#[specta::specta]
pub async fn is_model_downloaded(
    state: State<'_, AppState>,
    model_id: String,
) -> Result<bool, String> {
    let engine = state
        .asr_engine
        .read()
        .map_err(|e| format!("无法获取 ASR 引擎: {}", e))?;

    Ok(engine.is_model_available(&model_id))
}

/// 获取模型信息
#[tauri::command]
#[specta::specta]
pub async fn get_model_info(
    state: State<'_, AppState>,
    model_id: String,
) -> Result<Option<ModelInfo>, String> {
    let engine = state
        .asr_engine
        .read()
        .map_err(|e| format!("无法获取 ASR 引擎: {}", e))?;

    Ok(engine.get_model_info(&model_id))
}

/// 检查是否至少有一个模型已下载
#[tauri::command]
#[specta::specta]
pub async fn has_any_model_downloaded(state: State<'_, AppState>) -> Result<bool, String> {
    let engine = state
        .asr_engine
        .read()
        .map_err(|e| format!("无法获取 ASR 引擎: {}", e))?;

    let models = engine.list_models();
    Ok(models.iter().any(|m| m.is_downloaded))
}

/// 下载并安装模型
///
/// 从网络下载真实的模型文件并解压安装
#[tauri::command]
#[specta::specta]
pub async fn download_model(
    app: AppHandle,
    state: State<'_, AppState>,
    model_id: String,
) -> Result<(), String> {
    // 获取模型信息和下载 URL（在作用域内完成，避免跨 await 持有锁）
    let (model_name, url) = {
        let engine = state
            .asr_engine
            .read()
            .map_err(|e| format!("无法获取 ASR 引擎: {}", e))?;

        // 获取模型信息
        let model_info = engine
            .get_model_info(&model_id)
            .ok_or_else(|| format!("未知的模型 ID: {}", model_id))?;

        // 获取下载 URL
        let url = engine
            .model_manager()
            .get_download_url(&model_id)
            .ok_or_else(|| format!("无法获取模型下载 URL: {}", model_id))?;

        (model_info.name, url)
    }; // engine 的读锁在这里自动释放

    let models_dir = crate::storage::get_models_dir().map_err(|e| e.to_string())?;

    tracing::info!("开始下载模型: {} ({})", model_name, url);

    // 创建下载器
    let downloader = ModelDownloader::new();

    // 下载并安装（暂不使用进度回调，简化实现）
    downloader
        .download_and_install(&url, &models_dir, None)
        .await
        .map_err(|e| format!("下载模型失败: {}", e))?;

    // 发送完成事件
    let _ = app.emit("model_download_complete", ModelDownloadComplete {
        model_id: model_id.clone(),
        success: true,
        error: None,
    });

    tracing::info!("模型下载完成: {}", model_id);
    Ok(())
}

