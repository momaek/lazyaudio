//! ASR 相关命令

use crate::asr::{ModelDownloader, ModelInfo};
use crate::commands::model_events::{ModelDownloadComplete, ModelDownloadProgress};
use crate::state::AppState;
use crate::storage::AsrProviderType;
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

    // 创建进度回调，发送进度事件到前端
    let app_clone = app.clone();
    let model_id_clone = model_id.clone();
    let last_progress = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0));
    let last_progress_clone = last_progress.clone();
    let progress_callback: crate::asr::ProgressCallback =
        Box::new(move |downloaded: u64, total: Option<u64>| {
            let total_bytes = total.unwrap_or(0);
            let progress = if total_bytes > 0 {
                (downloaded as f64 / total_bytes as f64) * 100.0
            } else {
                0.0
            };

            // 每增加 1% 才发送一次事件，避免过于频繁
            let progress_int = progress as u64;
            let last = last_progress_clone.load(std::sync::atomic::Ordering::Relaxed);
            if progress_int > last || downloaded == total_bytes {
                last_progress_clone.store(progress_int, std::sync::atomic::Ordering::Relaxed);
                
                tracing::debug!(
                    "下载进度: {} - {}/{} bytes ({:.1}%)",
                    model_id_clone,
                    downloaded,
                    total_bytes,
                    progress
                );

                if let Err(e) = app_clone.emit(
                    "model-download-progress",
                    ModelDownloadProgress {
                        model_id: model_id_clone.clone(),
                        downloaded,
                        total: total_bytes,
                        progress,
                    },
                ) {
                    tracing::error!("发送下载进度事件失败: {}", e);
                }
            }
        });

    // 下载并安装
    let result = downloader
        .download_and_install(&url, &models_dir, &model_id, Some(progress_callback))
        .await;

    match result {
        Ok(_) => {
            // 发送完成事件
            let _ = app.emit(
                "model-download-complete",
                ModelDownloadComplete {
                    model_id: model_id.clone(),
                    success: true,
                    error: None,
                },
            );
            tracing::info!("模型下载完成: {}", model_id);
            Ok(())
        }
        Err(e) => {
            // 发送失败事件
            let error_msg = format!("下载模型失败: {}", e);
            let _ = app.emit(
                "model-download-complete",
                ModelDownloadComplete {
                    model_id: model_id.clone(),
                    success: false,
                    error: Some(error_msg.clone()),
                },
            );
            Err(error_msg)
        }
    }
}

/// 检查 ASR 是否就绪（本地有模型 OR 云端已配置 API Key）
///
/// 用于 router guards 判断是否需要引导流程
#[tauri::command]
#[specta::specta]
pub async fn is_asr_ready(state: State<'_, AppState>) -> Result<bool, String> {
    let app_config = state.storage.get_config().await;
    let asr_config = &app_config.asr;

    match asr_config.provider {
        AsrProviderType::Local => {
            // 本地模式：检查是否有已下载的模型
            let engine = state
                .asr_engine
                .read()
                .map_err(|e| format!("无法获取 ASR 引擎: {}", e))?;
            let models = engine.list_models();
            Ok(models.iter().any(|m| m.is_downloaded))
        }
        AsrProviderType::OpenAiWhisper => {
            // OpenAI Whisper：检查 API Key 是否已配置
            Ok(asr_config
                .openai_whisper
                .as_ref()
                .is_some_and(|c| !c.api_key.is_empty()))
        }
        AsrProviderType::Deepgram => {
            // Deepgram：检查 API Key 是否已配置
            Ok(asr_config
                .deepgram
                .as_ref()
                .is_some_and(|c| !c.api_key.is_empty()))
        }
        _ => {
            // 其他 Provider 暂未实现，视为未就绪
            Ok(false)
        }
    }
}

/// 测试 ASR Provider 连接
///
/// 对远端 Provider 发送测试请求验证 API Key 有效性
#[tauri::command]
#[specta::specta]
pub async fn test_asr_provider(
    state: State<'_, AppState>,
    provider: AsrProviderType,
) -> Result<bool, String> {
    let app_config = state.storage.get_config().await;
    let asr_config = &app_config.asr;

    match provider {
        AsrProviderType::Local => {
            // 本地模式：检查是否有已下载的模型
            let engine = state
                .asr_engine
                .read()
                .map_err(|e| format!("无法获取 ASR 引擎: {}", e))?;
            let models = engine.list_models();
            Ok(models.iter().any(|m| m.is_downloaded))
        }
        AsrProviderType::OpenAiWhisper => {
            let config = asr_config
                .openai_whisper
                .clone()
                .unwrap_or_default();
            if config.api_key.is_empty() {
                return Err("OpenAI Whisper API Key 未配置".to_string());
            }
            // 发送简单的 API 请求测试连接
            let client = reqwest::Client::new();
            let url = format!("{}/models", config.base_url.trim_end_matches('/'));
            let resp = client
                .get(&url)
                .header("Authorization", format!("Bearer {}", config.api_key))
                .timeout(std::time::Duration::from_secs(10))
                .send()
                .await
                .map_err(|e| format!("连接失败: {}", e))?;
            if resp.status().is_success() {
                Ok(true)
            } else {
                Err(format!("API 返回错误状态: {}", resp.status()))
            }
        }
        AsrProviderType::Deepgram => {
            let config = asr_config
                .deepgram
                .clone()
                .unwrap_or_default();
            if config.api_key.is_empty() {
                return Err("Deepgram API Key 未配置".to_string());
            }
            // 从 base_url 推导 HTTP 端点（wss:// → https://，ws:// → http://）
            let http_base = config
                .base_url
                .replace("wss://", "https://")
                .replace("ws://", "http://");
            // 提取 host 部分，构造 projects API 端点
            let test_url = match url::Url::parse(&http_base) {
                Ok(parsed) => format!(
                    "{}://{}/v1/projects",
                    parsed.scheme(),
                    parsed.host_str().unwrap_or("api.deepgram.com")
                ),
                Err(_) => "https://api.deepgram.com/v1/projects".to_string(),
            };

            let client = reqwest::Client::new();
            let resp = client
                .get(&test_url)
                .header("Authorization", format!("Token {}", config.api_key))
                .timeout(std::time::Duration::from_secs(10))
                .send()
                .await
                .map_err(|e| format!("连接失败: {}", e))?;
            if resp.status().is_success() {
                Ok(true)
            } else {
                Err(format!("API 返回错误状态: {}", resp.status()))
            }
        }
        _ => Err(format!(
            "Provider '{}' 尚未支持测试",
            provider.display_name()
        )),
    }
}

