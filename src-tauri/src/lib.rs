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

use audio::AudioSource;
use commands::{ModelDownloadComplete, ModelDownloadProgress};
use permissions::{AllPermissionsStatus, PermissionManager, PermissionStatus, PermissionType};
use state::AppState;
use storage::{AppConfig, SessionAudioConfig, SessionMeta, SessionRecord, TranscriptSegment};
use tauri_specta::{collect_commands, Builder, Event};

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
// 权限相关 Commands
// ============================================================================

/// 检查指定权限状态
#[tauri::command]
#[specta::specta]
fn check_permission(permission: PermissionType) -> PermissionStatus {
    let manager = PermissionManager::new();
    manager.check(permission)
}

/// 请求指定权限
///
/// 注意：并非所有权限都可以程序化请求
/// - macOS 屏幕录制和辅助功能需要在系统设置中手动授权
/// - 麦克风权限可以通过弹窗请求
#[tauri::command]
#[specta::specta]
fn request_permission(permission: PermissionType) -> PermissionStatus {
    let manager = PermissionManager::new();
    manager.request(permission)
}

/// 打开系统权限设置页面
#[tauri::command]
#[specta::specta]
fn open_permission_settings(permission: PermissionType) -> Result<(), String> {
    let manager = PermissionManager::new();
    manager.open_settings(permission)
}

/// 检查所有权限状态
#[tauri::command]
#[specta::specta]
fn check_all_permissions() -> AllPermissionsStatus {
    let manager = PermissionManager::new();
    manager.check_all()
}

/// 检查所有必需权限是否已授权
#[tauri::command]
#[specta::specta]
fn all_required_permissions_granted() -> bool {
    let manager = PermissionManager::new();
    manager.all_required_granted()
}

// ============================================================================
// 音频相关 Commands
// ============================================================================

/// 列出所有可用的音频源
///
/// 返回系统音频源和麦克风设备列表
#[tauri::command]
#[specta::specta]
fn list_audio_sources() -> Result<Vec<AudioSource>, String> {
    audio::list_all_sources().map_err(|e| e.to_string())
}

/// 列出可用的麦克风设备
#[tauri::command]
#[specta::specta]
fn list_microphones() -> Result<Vec<AudioSource>, String> {
    audio::list_microphones().map_err(|e| e.to_string())
}

/// 列出可用的系统音频源（macOS）
///
/// 包括系统音频和正在播放音频的应用
#[cfg(target_os = "macos")]
#[tauri::command]
#[specta::specta]
fn list_system_audio_sources(app: tauri::AppHandle) -> Result<Vec<AudioSource>, String> {
    audio::macos::list_system_sources(Some(&app)).map_err(|e| e.to_string())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
#[specta::specta]
fn list_system_audio_sources() -> Result<Vec<AudioSource>, String> {
    Ok(vec![])
}

// ============================================================================
// 音频测试 Commands
// ============================================================================

/// 音频电平事件数据
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type, tauri_specta::Event)]
pub struct AudioLevelEvent {
    /// 麦克风音量电平 (0.0 - 1.0)
    #[serde(rename = "micLevel")]
    pub mic_level: f32,
    /// 麦克风峰值电平 (0.0 - 1.0)
    #[serde(rename = "micPeak")]
    pub mic_peak: f32,
    /// 系统音频音量电平 (0.0 - 1.0)
    #[serde(rename = "systemLevel")]
    pub system_level: f32,
    /// 系统音频峰值电平 (0.0 - 1.0)
    #[serde(rename = "systemPeak")]
    pub system_peak: f32,
    /// 已处理采样数
    pub samples: u64,
    /// 采集时长（毫秒）
    #[serde(rename = "durationMs")]
    pub duration_ms: u64,
}

/// 音频测试启动结果
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct AudioTestStartResult {
    /// 麦克风录制文件路径
    #[serde(rename = "micRecordingPath")]
    pub mic_recording_path: Option<String>,
    /// 系统音频录制文件路径
    #[serde(rename = "systemRecordingPath")]
    pub system_recording_path: Option<String>,
}

/// 开始音频测试采集
#[tauri::command]
#[specta::specta]
fn start_audio_test(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    mic_id: String,
    system_source_id: Option<String>,
    enable_recording: bool,
) -> Result<AudioTestStartResult, String> {
    use audio::{AudioCapture, AudioCaptureConfig, LevelMeter, MicrophoneCapture, WavRecorder, SoftLimiter, LimiterConfig};
    #[cfg(target_os = "macos")]
    use audio::MacOSSystemCapture;
    use std::sync::atomic::Ordering;
    
    if state.audio_test.running() {
        return Err("音频测试已在运行中".to_string());
    }
    
    // 判断是否需要采集系统音频
    let capture_system = system_source_id.is_some();
    
    tracing::info!(
        "开始音频测试: mic={}, system={:?}, recording={}",
        mic_id, system_source_id, enable_recording
    );
    
    // 生成录制文件路径
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let base_dir = dirs::audio_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("LazyAudio");
    
    let mic_recording_path = if enable_recording {
        Some(base_dir.join(format!("mic_{}.wav", timestamp)))
    } else {
        None
    };
    
    let system_recording_path = if enable_recording && capture_system {
        Some(base_dir.join(format!("system_{}.wav", timestamp)))
    } else {
        None
    };
    
    let result = AudioTestStartResult {
        mic_recording_path: mic_recording_path.clone().map(|p| p.to_string_lossy().to_string()),
        system_recording_path: system_recording_path.clone().map(|p| p.to_string_lossy().to_string()),
    };
    
    // 标记为运行中
    state.audio_test.set_running(true);
    let is_running = state.audio_test.is_running.clone();
    let app_handle = app.clone();
    let app_handle_for_system = app.clone();
    
    // 在独立线程中创建和运行音频采集（cpal Stream 不是 Send）
    std::thread::spawn(move || {
        // ========== 麦克风采集 ==========
        let mut mic_capture = MicrophoneCapture::new();
        
        // 获取麦克风源
        let sources = match mic_capture.list_sources() {
            Ok(s) => s,
            Err(e) => {
                tracing::error!("获取麦克风列表失败: {}", e);
                is_running.store(false, Ordering::SeqCst);
                return;
            }
        };
        
        let mic_source = match sources.into_iter().find(|s| s.id == mic_id) {
            Some(s) => s,
            None => {
                tracing::error!("未找到麦克风: {}", mic_id);
                is_running.store(false, Ordering::SeqCst);
                return;
            }
        };
        
        // 启动麦克风采集
        let config = AudioCaptureConfig::default();
        let mic_stream = match mic_capture.start(&mic_source, &config) {
            Ok(s) => s,
            Err(e) => {
                tracing::error!("启动麦克风采集失败: {}", e);
                is_running.store(false, Ordering::SeqCst);
                return;
            }
        };
        
        // 创建麦克风录制器
        let mut mic_recorder = mic_recording_path.and_then(|path| {
            match WavRecorder::new(path.clone(), config.sample_rate, config.channels as u16) {
                Ok(r) => {
                    tracing::info!("麦克风 WAV 录制器已创建: {:?}", path);
                    Some(r)
                }
                Err(e) => {
                    tracing::error!("创建麦克风 WAV 录制器失败: {}", e);
                    None
                }
            }
        });
        
        // ========== 系统音频采集（仅 macOS）==========
        // 注意：系统音频的 WavRecorder 延迟创建，等收到第一个 AudioChunk 后根据其实际格式创建
        #[cfg(target_os = "macos")]
        let (mut system_capture, system_stream): (Option<MacOSSystemCapture>, Option<audio::AudioStream>) = 'system_init: {
            let Some(ref source_id) = system_source_id else {
                break 'system_init (None, None);
            };
            
            let mut capture = MacOSSystemCapture::new(Some(app_handle_for_system));
            
            // 获取系统音频源
            let sources = match capture.list_sources() {
                Ok(s) => s,
                Err(e) => {
                    tracing::error!("获取系统音频源失败: {}", e);
                    break 'system_init (None, None);
                }
            };
            
            let system_source = sources.into_iter().find(|s| s.id == *source_id);
            
            let Some(source) = system_source else {
                tracing::warn!("未找到系统音频源: {}", source_id);
                break 'system_init (None, None);
            };
            
            match capture.start(&source, &config) {
                Ok(stream) => {
                    (Some(capture), Some(stream))
                }
                Err(e) => {
                    tracing::error!("启动系统音频采集失败: {}", e);
                    (None, None)
                }
            }
        };
        
        // 系统音频录制器 - 延迟创建
        #[cfg(target_os = "macos")]
        let mut system_recorder: Option<WavRecorder> = None;
        
        // 系统音频限幅器（防止 AudioCapCLI 输出的音频削波）
        #[cfg(target_os = "macos")]
        let mut system_limiter = SoftLimiter::new(LimiterConfig {
            enabled: true,
            threshold: 0.9,
            ceiling: 0.99,
            knee: 0.5,
        });
        tracing::info!("系统音频限幅器已启用: threshold=0.9, ceiling=0.99");
        
        #[cfg(not(target_os = "macos"))]
        let (mut system_capture, system_stream): (Option<()>, Option<audio::AudioStream>) = (None, None);
        #[cfg(not(target_os = "macos"))]
        let mut system_recorder: Option<WavRecorder> = None;
        let _ = &mut system_capture; // suppress unused warning on non-macos
        let _ = &mut system_recorder;
        
        // 使用 tokio runtime 来处理异步接收
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("Failed to create tokio runtime");
        
        rt.block_on(async {
            let mut mic_stream = mic_stream;
            let mut mic_level_meter = LevelMeter::new(4096);
            let mut system_level_meter = LevelMeter::new(4096);
            let mut total_samples: u64 = 0;
            let start_time = std::time::Instant::now();
            let mut last_emit = std::time::Instant::now();
            
            // 系统音频流（如果有）
            #[cfg(target_os = "macos")]
            let mut system_stream_opt = system_stream;
            #[cfg(not(target_os = "macos"))]
            let system_stream_opt: Option<audio::AudioStream> = system_stream;
            
            while is_running.load(Ordering::SeqCst) {
                // 处理麦克风数据
                tokio::select! {
                    biased;
                    
                    chunk = mic_stream.recv() => {
                        if let Some(audio_chunk) = chunk {
                            // 写入麦克风录制文件
                            if let Some(ref mut rec) = mic_recorder {
                                if let Err(e) = rec.write_samples(&audio_chunk.samples) {
                                    tracing::error!("写入麦克风 WAV 失败: {}", e);
                                }
                            }
                            
                            // 更新麦克风音量电平
                            mic_level_meter.push_samples(&audio_chunk.samples);
                            total_samples += audio_chunk.samples.len() as u64;
                        }
                    }
                    
                    _ = tokio::time::sleep(std::time::Duration::from_millis(10)) => {}
                }
                
                // 处理系统音频数据（如果有）
                if let Some(ref mut sys_stream) = system_stream_opt {
                    if let Ok(chunk) = sys_stream.try_recv() {
                        // 应用限幅器，防止削波
                        #[cfg(target_os = "macos")]
                        let limited_chunk = system_limiter.process(&chunk);
                        #[cfg(not(target_os = "macos"))]
                        let limited_chunk = chunk;
                        
                        // 延迟创建系统音频录制器（使用实际的采样率和声道数）
                        #[cfg(target_os = "macos")]
                        if system_recorder.is_none() && system_recording_path.is_some() {
                            if let Some(ref path) = system_recording_path {
                                match WavRecorder::new(path.clone(), limited_chunk.sample_rate, limited_chunk.channels) {
                                    Ok(r) => {
                                        tracing::info!(
                                            "系统音频 WAV 录制器已创建: {:?} ({}Hz, {}ch)",
                                            path, limited_chunk.sample_rate, limited_chunk.channels
                                        );
                                        system_recorder = Some(r);
                                    }
                                    Err(e) => {
                                        tracing::error!("创建系统音频 WAV 录制器失败: {}", e);
                                    }
                                }
                            }
                        }
                        
                        // 写入限幅后的系统音频数据
                        #[cfg(target_os = "macos")]
                        if let Some(ref mut rec) = system_recorder {
                            if let Err(e) = rec.write_samples(&limited_chunk.samples) {
                                tracing::error!("写入系统音频 WAV 失败: {}", e);
                            }
                        }
                        
                        // 更新系统音频电平（使用限幅后的数据）
                        system_level_meter.push_samples(&limited_chunk.samples);
                    }
                }
                
                // 每 50ms 发送一次事件
                if last_emit.elapsed().as_millis() >= 50 {
                    let event = AudioLevelEvent {
                        mic_level: mic_level_meter.get_smoothed_level(),
                        mic_peak: mic_level_meter.get_peak(),
                        system_level: system_level_meter.get_smoothed_level(),
                        system_peak: system_level_meter.get_peak(),
                        samples: total_samples,
                        duration_ms: start_time.elapsed().as_millis() as u64,
                    };
                    let _ = event.emit(&app_handle);
                    last_emit = std::time::Instant::now();
                }
            }
            
            // 完成麦克风录制
            if let Some(mut rec) = mic_recorder {
                if let Err(e) = rec.finalize() {
                    tracing::error!("完成麦克风 WAV 录制失败: {}", e);
                }
            }
            
            // 完成系统音频录制
            #[cfg(target_os = "macos")]
            if let Some(mut rec) = system_recorder {
                if let Err(e) = rec.finalize() {
                    tracing::error!("完成系统音频 WAV 录制失败: {}", e);
                }
                
                // 输出限幅器统计
                let stats = system_limiter.stats();
                tracing::info!(
                    "系统音频限幅器统计: 处理采样数={}, 限幅比例={:.2}%, 最大输入值={:.4}",
                    stats.samples_processed,
                    stats.limiting_ratio * 100.0,
                    stats.max_input_value
                );
            }
            
            // 停止采集
            let _ = mic_capture.stop();
            #[cfg(target_os = "macos")]
            if let Some(mut cap) = system_capture {
                let _ = cap.stop();
            }
            
            is_running.store(false, Ordering::SeqCst);
            
            tracing::info!("音频测试任务结束，共处理 {} 采样", total_samples);
        });
    });
    
    Ok(result)
}

/// 停止音频测试采集
#[tauri::command]
#[specta::specta]
fn stop_audio_test(state: tauri::State<'_, AppState>) -> Result<(), String> {
    if !state.audio_test.running() {
        return Ok(());
    }
    
    tracing::info!("停止音频测试");
    state.audio_test.set_running(false);
    
    Ok(())
}

// ============================================================================
// Specta Builder
// ============================================================================

/// 构建 Tauri specta 类型导出器
fn build_specta_builder() -> Builder {
    Builder::<tauri::Wry>::new()
        .commands(collect_commands![
            greet,
            get_config,
            set_config,
            create_session,
            get_session,
            list_sessions,
            delete_session,
            get_transcript,
            // 权限相关
            check_permission,
            request_permission,
            open_permission_settings,
            check_all_permissions,
            all_required_permissions_granted,
            // 音频相关
            list_audio_sources,
            list_microphones,
            list_system_audio_sources,
            // 音频测试
            start_audio_test,
            stop_audio_test,
            // ASR 模型相关
            commands::asr::list_asr_models,
            commands::asr::is_model_downloaded,
            commands::asr::get_model_info,
            commands::asr::has_any_model_downloaded,
            commands::asr::download_model,
        ])
        .events(tauri_specta::collect_events![
            AudioLevelEvent,
            ModelDownloadProgress,
            ModelDownloadComplete,
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
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::new())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
