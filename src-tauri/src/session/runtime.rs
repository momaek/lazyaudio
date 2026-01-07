//! Session 运行时模块
//!
//! 管理 Session 的音频采集和 ASR 处理

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::thread::JoinHandle;

use chrono::Utc;
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::asr::{AsrEngine, StreamingRecognizer, SileroVadWrapper, VadConfig, VAD_MODEL_ID};
use crate::asr::multi_pass::{DelayedRefineConfig, DelayedRefiner, RefineResult};
use crate::audio::{
    AudioCapture, AudioCaptureConfig, AudioChunk, LevelMeter, MicrophoneCapture, Resampler,
    SoftLimiter, LimiterConfig,
};
#[cfg(target_os = "macos")]
use crate::audio::MacOSSystemCapture;
use crate::event::{
    AppEvent, AudioLevelPayload, SharedEventBus, TranscriptFinalPayload, TranscriptPartialPayload,
    TranscriptUpdatedPayload,
};
use crate::storage::{TranscriptSegment, TranscriptSource};

use super::types::SessionId;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ActiveSource {
    Microphone,
    System,
}

impl ActiveSource {
    fn to_transcript_source(self) -> TranscriptSource {
        match self {
            ActiveSource::Microphone => TranscriptSource::Microphone,
            ActiveSource::System => TranscriptSource::System,
        }
    }
}

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
                mic_id,
                system_source_id,
                event_bus,
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

/// 运行 Session 音频采集和 ASR
fn run_session_audio(
    session_id: SessionId,
    is_running: Arc<AtomicBool>,
    is_paused: Arc<AtomicBool>,
    use_microphone: bool,
    use_system_audio: bool,
    merge_for_asr: bool,
    mic_id: Option<String>,
    system_source_id: Option<String>,
    event_bus: SharedEventBus,
    recognizer: Option<StreamingRecognizer>,
    app_handle: Option<tauri::AppHandle>,
) {
    info!(
        session_id = %session_id,
        use_microphone,
        use_system_audio,
        has_recognizer = recognizer.is_some(),
        "Session 音频采集线程启动"
    );

    let config = AudioCaptureConfig::default();

    // ========== 初始化麦克风 ==========
    // 注意：必须保持 mic_capture 的生命周期，否则采集会停止
    let mut _mic_capture_holder: Option<MicrophoneCapture> = None;
    let mic_capture_result = if use_microphone {
        let mut mic_capture = MicrophoneCapture::new();
        
        // 获取麦克风源
        let sources = match mic_capture.list_sources() {
            Ok(s) => s,
            Err(e) => {
                error!("获取麦克风列表失败: {}", e);
                Vec::new()
            }
        };

        // 选择麦克风
        let mic_source = if let Some(ref id) = mic_id {
            sources.into_iter().find(|s| s.id == *id)
        } else {
            sources.into_iter().find(|s| s.is_default)
        };

        match mic_source {
            Some(source) => {
                match mic_capture.start(&source, &config) {
                    Ok(stream) => {
                        // 保持 mic_capture 存活
                        _mic_capture_holder = Some(mic_capture);
                        Some(stream)
                    }
                    Err(e) => {
                        error!("启动麦克风采集失败: {}", e);
                        None
                    }
                }
            }
            None => {
                warn!("未找到麦克风");
                None
            }
        }
    } else {
        None
    };

    // ========== 初始化系统音频（macOS）==========
    // 注意：必须保持 system_capture 的生命周期，否则采集会停止
    #[cfg(target_os = "macos")]
    let mut _system_capture_holder: Option<MacOSSystemCapture> = None;
    #[cfg(target_os = "macos")]
    let system_capture_result: Option<crate::audio::AudioStream> = if use_system_audio {
        use crate::audio::AudioSource;
        let mut capture = MacOSSystemCapture::new(app_handle);
        
        // 优化：如果是系统音频，直接创建源，避免不必要的 list_sources 调用
        let source = match system_source_id.as_deref() {
            None | Some("system") => {
                // 系统音频：直接创建，不需要列出所有源
                Some(AudioSource::system_audio())
            }
            Some(id) => {
                // 特定应用：需要查找
                match capture.list_sources() {
                    Ok(sources) => sources.into_iter().find(|s| s.id == id),
                    Err(e) => {
                        error!("获取系统音频源失败: {}", e);
                        None
                    }
                }
            }
        };

        match source {
            Some(s) => {
                match capture.start(&s, &config) {
                    Ok(stream) => {
                        // 保持 capture 存活
                        _system_capture_holder = Some(capture);
                        Some(stream)
                    }
                    Err(e) => {
                        error!("启动系统音频采集失败: {}", e);
                        None
                    }
                }
            }
            None => {
                warn!("未找到系统音频源");
                None
            }
        }
    } else {
        None
    };
    
    #[cfg(not(target_os = "macos"))]
    let system_capture_result: Option<crate::audio::AudioStream> = None;

    // 检查是否有任何音频源
    if mic_capture_result.is_none() && system_capture_result.is_none() {
        error!("没有可用的音频源");
        return;
    }

    // 创建 tokio runtime
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("Failed to create tokio runtime");

    rt.block_on(async {
        let mut mic_stream = mic_capture_result;
        let mut mic_level_meter = LevelMeter::new(4096);
        let mut system_level_meter = LevelMeter::new(4096);
        
        #[cfg(target_os = "macos")]
        let mut system_stream = system_capture_result;
        #[cfg(target_os = "macos")]
        let mut system_limiter = SoftLimiter::new(LimiterConfig {
            enabled: true,
            threshold: 0.9,
            ceiling: 0.99,
            knee: 0.5,
        });
        
        #[cfg(not(target_os = "macos"))]
        let mut system_stream: Option<crate::audio::AudioStream> = system_capture_result;

        let start_time = std::time::Instant::now();
        let mut last_emit = std::time::Instant::now();
        let mut last_partial_text = String::new();

        // 延迟创建 resampler：根据实际音频采样率决定是否需要
        // None = 还未初始化，Some(None) = 不需要（已经是 16kHz），Some(Some(r)) = 需要
        let mut resampler: Option<Option<Resampler>> = None;

        let default_source = if use_microphone && use_system_audio {
            TranscriptSource::Mixed
        } else if use_microphone {
            TranscriptSource::Microphone
        } else {
            TranscriptSource::System
        };

        let mut allow_separate = use_microphone && use_system_audio && !merge_for_asr;
        let mut active_source: Option<ActiveSource> = None;

        // Recognizer（可能没有）
        let mut recognizer = recognizer;

        // Multi-pass: segment_id 计数器
        let mut segment_id_counter: u64 = 0;

        let segment_sources: Arc<Mutex<HashMap<String, TranscriptSource>>> =
            Arc::new(Mutex::new(HashMap::new()));
        
        // 临时音频缓冲区（用于收集一个语音段落的所有音频数据）
        let mut temp_audio_buffer: Vec<f32> = Vec::new();
        let mut temp_buffer_start_time: f64 = 0.0;

        // ========== 延迟精修调度器（使用 SenseVoice 离线识别） ==========
        // 每个 segment 完成后独立计时，延迟 N 秒后使用 SenseVoice 精修
        let delayed_refiner: Option<Arc<DelayedRefiner>> = if recognizer.is_some() {
            let config = DelayedRefineConfig {
                enabled: true,
                delay_ms: 3000,  // 3 秒后精修
                max_concurrent: 5,
                timeout_ms: 15000,  // SenseVoice 可能需要更长时间
            };
            
            // 尝试加载 SenseVoice 模型
            let sense_voice_model_id = "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17";
            let app_support_dir = dirs::data_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("."))
                .join("LazyAudio")
                .join("models")
                .join(sense_voice_model_id);
            
            let refiner = if app_support_dir.exists() {
                match DelayedRefiner::with_sense_voice(config.clone(), &app_support_dir, 2) {
                    Ok(r) => {
                        info!("Multi-pass: SenseVoice 精修器已加载，3秒后精修（带标点）");
                        r
                    }
                    Err(e) => {
                        warn!("加载 SenseVoice 失败: {}，使用无精修模式", e);
                        DelayedRefiner::without_recognizer(config)
                    }
                }
            } else {
                warn!(
                    "SenseVoice 模型未下载: {}，使用无精修模式",
                    app_support_dir.display()
                );
                DelayedRefiner::without_recognizer(config)
            };
            
            let refiner = Arc::new(refiner);
            
            // 设置精修结果回调（在主循环开始前同步设置）
            let event_bus_for_refine = event_bus.clone();
            let session_id_for_refine = session_id.clone();
            let segment_sources_for_refine = segment_sources.clone();
            let refiner_for_callback = refiner.clone();
            
            refiner_for_callback.set_callback(Arc::new(move |result: RefineResult| {
                let source = segment_sources_for_refine
                    .lock()
                    .ok()
                    .and_then(|mut map| map.remove(&result.segment_id))
                    .unwrap_or(TranscriptSource::Mixed);

                // 发送 TranscriptUpdated 事件
                let segment = TranscriptSegment {
                    id: result.segment_id.clone(),
                    start_time: 0.0,  // 前端会忽略
                    end_time: 0.0,    // 前端会忽略
                    text: result.text.clone(),
                    is_final: true,
                    confidence: Some(result.confidence),
                    source: Some(source),
                    language: None,
                    words: None,
                    created_at: Utc::now().to_rfc3339(),
                    tier: Some("tier2".to_string()),
                };
                
                event_bus_for_refine.publish(AppEvent::TranscriptUpdated(TranscriptUpdatedPayload {
                    session_id: session_id_for_refine.clone(),
                    segment_id: result.segment_id.clone(),
                    tier: "tier2".to_string(),
                    text: result.text,
                    confidence: result.confidence,
                    segment,
                }));
                
                tracing::info!(
                    "SenseVoice 精修完成: segment={}, changed={}",
                    result.segment_id,
                    result.has_changed
                );
            })).await;
            
            info!("SenseVoice 回调已设置完成");
            Some(refiner)
        } else {
            None
        };

        // ========== Silero VAD 初始化（神经网络语音活动检测） ==========
        // 用于精确切分语音段落，避免在句子中间被切断
        let mut silero_vad: Option<SileroVadWrapper> = if recognizer.is_some() {
            let vad_model_dir = dirs::data_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("."))
                .join("LazyAudio")
                .join("models")
                .join(VAD_MODEL_ID);

            if vad_model_dir.exists() {
                let vad_config = VadConfig {
                    // 静音 1.0 秒后认为语音结束
                    min_silence_duration: 1.0,
                    // 最短语音 0.3 秒
                    min_speech_duration: 0.3,
                    // 最长语音 20 秒
                    max_speech_duration: 20.0,
                    // 检测阈值
                    threshold: 0.5,
                    ..Default::default()
                };

                match SileroVadWrapper::from_model_dir(&vad_model_dir, vad_config) {
                    Ok(vad) => {
                        info!("Silero VAD 已加载，用于精确语音切分");
                        Some(vad)
                    }
                    Err(e) => {
                        warn!("加载 Silero VAD 失败: {}，使用 endpoint 检测", e);
                        None
                    }
                }
            } else {
                warn!(
                    "Silero VAD 模型未下载: {}，使用 endpoint 检测",
                    vad_model_dir.display()
                );
                None
            }
        } else {
            None
        };

        if allow_separate && silero_vad.is_none() {
            warn!("VAD 未就绪，无法进行分路识别，将回退为合并模式");
            allow_separate = false;
        }

        // VAD 模式下的音频缓冲区
        let mut vad_audio_buffer: Vec<f32> = Vec::new();
        let mut vad_buffer_start_time: f64 = 0.0;

        while is_running.load(Ordering::SeqCst) {
            // 如果暂停，跳过处理
            if is_paused.load(Ordering::SeqCst) {
                tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
                continue;
            }

            // 处理麦克风数据
            let mic_chunk: Option<AudioChunk> = if let Some(ref mut stream) = mic_stream {
                tokio::select! {
                    biased;
                    chunk = stream.recv() => chunk,
                    _ = tokio::time::sleep(tokio::time::Duration::from_millis(10)) => None,
                }
            } else {
                None
            };

            // 处理系统音频数据
            #[cfg(target_os = "macos")]
            let system_chunk: Option<AudioChunk> = if let Some(ref mut stream) = system_stream {
                tokio::select! {
                    biased;
                    chunk = stream.recv() => {
                        // 应用限幅器
                        chunk.map(|c| system_limiter.process(&c))
                    },
                    _ = tokio::time::sleep(tokio::time::Duration::from_millis(10)) => None,
                }
            } else {
                None
            };
            
            #[cfg(not(target_os = "macos"))]
            let system_chunk: Option<AudioChunk> = if let Some(ref mut stream) = system_stream {
                tokio::select! {
                    biased;
                    chunk = stream.recv() => chunk,
                    _ = tokio::time::sleep(tokio::time::Duration::from_millis(10)) => None,
                }
            } else {
                None
            };

        // 选择用于 ASR 的音频
        let mut source_for_asr = default_source;
        let audio_for_asr = if allow_separate {
                let vad_is_speech = silero_vad.as_ref().map(|v| v.is_speech()).unwrap_or(false);
                let mic_energy = mic_chunk
                    .as_ref()
                    .map(|chunk| {
                        let sum = chunk.samples.iter().map(|s| s * s).sum::<f32>();
                        (sum / chunk.samples.len().max(1) as f32).sqrt()
                    })
                    .unwrap_or(0.0);
                let system_energy = system_chunk
                    .as_ref()
                    .map(|chunk| {
                        let sum = chunk.samples.iter().map(|s| s * s).sum::<f32>();
                        (sum / chunk.samples.len().max(1) as f32).sqrt()
                    })
                    .unwrap_or(0.0);
                let energy_threshold = 0.005;
                let hysteresis = 0.002;
                let mic_active = mic_energy > energy_threshold;
                let system_active = system_energy > energy_threshold;

                let select_source = |current: Option<ActiveSource>| -> Option<ActiveSource> {
                    match (mic_active, system_active) {
                        (true, false) => Some(ActiveSource::Microphone),
                        (false, true) => Some(ActiveSource::System),
                        (true, true) => {
                            let diff = mic_energy - system_energy;
                            if diff.abs() < hysteresis {
                                current.or(Some(ActiveSource::System))
                            } else if diff > 0.0 {
                                Some(ActiveSource::Microphone)
                            } else {
                                Some(ActiveSource::System)
                            }
                        }
                        (false, false) => None,
                    }
                };

                let next_source = if let Some(current) = active_source {
                    if vad_is_speech {
                        Some(current)
                    } else {
                        select_source(Some(current))
                    }
                } else {
                    select_source(None)
                };

                if next_source != active_source {
                    active_source = next_source;
                    last_partial_text.clear();
                    temp_audio_buffer.clear();
                    vad_audio_buffer.clear();
                    if let Some(ref mut vad) = silero_vad {
                        vad.reset();
                    }
                    if let Some(ref mut rec) = recognizer {
                        rec.reset();
                    }
                    resampler = None;
                }

                match active_source {
                    Some(ActiveSource::Microphone) => {
                        source_for_asr = TranscriptSource::Microphone;
                        mic_chunk.clone()
                    }
                    Some(ActiveSource::System) => {
                        source_for_asr = TranscriptSource::System;
                        system_chunk.clone()
                    }
                    None => None,
                }
            } else {
                source_for_asr = default_source;
                merge_audio_chunks(&mic_chunk, &system_chunk)
            };
            
            if let Some(chunk) = &audio_for_asr {
                // 更新电平
                if let Some(ref mc) = mic_chunk {
                    mic_level_meter.push_samples(&mc.samples);
                }
                if let Some(ref sc) = system_chunk {
                    system_level_meter.push_samples(&sc.samples);
                }

                // 发送电平事件（每100ms）
                if last_emit.elapsed() >= std::time::Duration::from_millis(100) {
                    let combined_level = mic_level_meter.get_smoothed_level().max(system_level_meter.get_smoothed_level());
                    let combined_db = mic_level_meter.get_smoothed_db().max(system_level_meter.get_smoothed_db());
                    
                    event_bus.publish(AppEvent::AudioLevel(AudioLevelPayload {
                        session_id: session_id.clone(),
                        level: combined_level,
                        db: combined_db,
                    }));
                    
                    last_emit = std::time::Instant::now();
                }

                // 如果有 recognizer，进行 ASR
                if let Some(ref mut recognizer) = &mut recognizer {
                    // 延迟初始化 resampler：根据实际音频采样率决定
                    if resampler.is_none() {
                        let input_rate = chunk.sample_rate;
                        info!(
                            "首次收到音频: sample_rate={}Hz, channels={}, samples={}",
                            input_rate, chunk.channels, chunk.samples.len()
                        );
                        if input_rate == 16000 {
                            // 已经是 16kHz，不需要 resampler
                            info!("音频输入已经是 16kHz，无需重采样");
                            resampler = Some(None);
                        } else {
                            // 需要重采样
                            info!("音频输入 {}Hz，创建重采样器到 16kHz", input_rate);
                            match Resampler::new(input_rate, 16000, 1) {
                                Ok(r) => resampler = Some(Some(r)),
                                Err(e) => {
                                    warn!("创建 resampler 失败: {}", e);
                                    resampler = Some(None);
                                }
                            }
                        }
                    }

                    // 转换为单声道
                    let mono_samples: Vec<f32> = if chunk.channels == 2 {
                        chunk.samples.chunks(2).map(|s| (s[0] + s[1]) / 2.0).collect()
                    } else {
                        chunk.samples.clone()
                    };
                    
                    // 根据是否需要重采样来处理
                    let samples_for_asr = match &mut resampler {
                        Some(Some(ref mut r)) => {
                            // 需要重采样
                            match r.process(&mono_samples) {
                                Ok(samples) => samples,
                                Err(e) => {
                                    warn!("重采样失败: {}", e);
                                    continue;
                                }
                            }
                        }
                        _ => {
                            // 不需要重采样，直接使用
                            mono_samples
                        }
                    };
                    
                    // ========== VAD + ASR 处理 ==========
                    // 如果有 VAD，用 VAD 来切分语音段落
                    // 否则用 endpoint 检测
                    
                    if let Some(ref mut vad) = silero_vad {
                        // VAD 模式：用 VAD 精确切分语音
                        
                        // 缓冲音频数据
                        if vad_audio_buffer.is_empty() {
                            vad_buffer_start_time = start_time.elapsed().as_secs_f64();
                        }
                        vad_audio_buffer.extend_from_slice(&samples_for_asr);
                        
                        // 送入 VAD 检测
                        let vad_segments = vad.process(&samples_for_asr);
                        
                        // 同时送入流式 ASR 获取实时结果
                        recognizer.accept_waveform(&samples_for_asr);
                        let result = recognizer.get_result();
                        
                        // 发送 partial 结果（实时显示）
                        if !result.text.is_empty() && result.text != last_partial_text {
                            last_partial_text = result.text.clone();
                            event_bus.publish(AppEvent::TranscriptPartial(TranscriptPartialPayload {
                                session_id: session_id.clone(),
                                text: result.text,
                                confidence: Some(result.confidence),
                            }));
                        }
                        
                        // 处理 VAD 检测到的完整语音段落
                        for vad_segment in vad_segments {
                            let elapsed = start_time.elapsed().as_secs_f64();
                            
                            // 用流式 ASR 的当前结果作为最终结果
                            let final_result = recognizer.finalize();
                            
                            if !final_result.text.is_empty() {
                                segment_id_counter += 1;
                                let segment_id = format!("{}_{}", session_id, segment_id_counter);
                                
                                info!(
                                    "VAD 切分语音段落: 时长 {:.1}s, 文本: '{}'",
                                    vad_segment.duration_secs,
                                    final_result.text
                                );
                                
                                let segment = TranscriptSegment {
                                    id: segment_id.clone(),
                                    start_time: vad_buffer_start_time,
                                    end_time: elapsed,
                                    text: final_result.text.clone(),
                                    is_final: true,
                                    confidence: Some(final_result.confidence),
                                    source: Some(source_for_asr),
                                    language: None,
                                    words: None,
                                    created_at: Utc::now().to_rfc3339(),
                                    tier: Some("tier1".to_string()),
                                };
                                
                                event_bus.publish(AppEvent::TranscriptFinal(TranscriptFinalPayload {
                                    session_id: session_id.clone(),
                                    segment,
                                }));
                                
                                // 调度延迟精修
                                if let Some(ref refiner) = delayed_refiner {
                                    if let Ok(mut map) = segment_sources.lock() {
                                        map.insert(segment_id.clone(), source_for_asr);
                                    }
                                    let refiner = refiner.clone();
                                    let session_id_clone = session_id.clone();
                                    let segment_id_clone = segment_id.clone();
                                    let audio_samples = vad_segment.samples.clone();
                                    let tier1_text = final_result.text.clone();
                                    
                                    tokio::spawn(async move {
                                        refiner.schedule(
                                            session_id_clone,
                                            segment_id_clone,
                                            audio_samples,
                                            tier1_text,
                                        ).await;
                                    });
                                }
                            }
                            
                            // 清空缓冲区和重置 ASR
                            vad_audio_buffer.clear();
                            last_partial_text.clear();
                            recognizer.reset();
                        }
                        
                        // 也缓存到 temp_audio_buffer 供后续使用
                        if temp_audio_buffer.is_empty() {
                            temp_buffer_start_time = start_time.elapsed().as_secs_f64();
                        }
                        temp_audio_buffer.extend_from_slice(&samples_for_asr);
                        
                    } else {
                        // 无 VAD 模式：使用原来的 endpoint 检测
                        
                        // 送入 ASR
                        recognizer.accept_waveform(&samples_for_asr);
                        
                        // Multi-pass: 缓存音频数据供 Tier 2/3 使用
                        if temp_audio_buffer.is_empty() {
                            temp_buffer_start_time = start_time.elapsed().as_secs_f64();
                        }
                        temp_audio_buffer.extend_from_slice(&samples_for_asr);
                        
                        // 获取结果
                        let result = recognizer.get_result();
                        
                        // 如果有文本且不是空的
                        if !result.text.is_empty() {
                            if result.is_final {
                                // 最终结果
                                let elapsed = start_time.elapsed().as_secs_f64();
                                let segment = TranscriptSegment {
                                    id: Uuid::new_v4().to_string(),
                                    start_time: elapsed - 2.0,
                                    end_time: elapsed,
                                    text: result.text.clone(),
                                    is_final: true,
                                    confidence: Some(result.confidence),
                                    source: Some(source_for_asr),
                                    language: None,
                                    words: None,
                                    created_at: Utc::now().to_rfc3339(),
                                    tier: Some("tier1".to_string()),
                                };
                                
                                event_bus.publish(AppEvent::TranscriptFinal(TranscriptFinalPayload {
                                    session_id: session_id.clone(),
                                    segment,
                                }));
                                
                                last_partial_text.clear();
                                recognizer.reset();
                            } else if result.text != last_partial_text {
                                // Partial 结果
                                last_partial_text = result.text.clone();
                                event_bus.publish(AppEvent::TranscriptPartial(TranscriptPartialPayload {
                                    session_id: session_id.clone(),
                                    text: result.text,
                                    confidence: Some(result.confidence),
                                }));
                            }
                        }
                    }
                    
                    // 检查端点（说话结束）- 仅在无 VAD 模式下使用
                    if silero_vad.is_none() && recognizer.is_endpoint() {
                        let final_result = recognizer.finalize();
                        if !final_result.text.is_empty() {
                            let elapsed = start_time.elapsed().as_secs_f64();
                            
                            // 生成唯一的 segment_id（用于 multi-pass 更新）
                            segment_id_counter += 1;
                            let segment_id = format!("{}_{}", session_id, segment_id_counter);
                            
                            let segment = TranscriptSegment {
                                id: segment_id.clone(),
                                start_time: temp_buffer_start_time,
                                end_time: elapsed,
                                text: final_result.text.clone(),
                                is_final: true,
                                confidence: Some(final_result.confidence),
                                source: Some(source_for_asr),
                                language: None,
                                words: None,
                                created_at: Utc::now().to_rfc3339(),
                                tier: Some("tier1".to_string()),  // Multi-pass: Tier 1 实时识别
                            };
                            
                            // 发送 Tier1 最终结果
                            event_bus.publish(AppEvent::TranscriptFinal(TranscriptFinalPayload {
                                session_id: session_id.clone(),
                                segment,
                            }));
                            
                            // Multi-pass: 调度延迟精修
                            if let Some(ref refiner) = delayed_refiner {
                                if !temp_audio_buffer.is_empty() {
                                    if let Ok(mut map) = segment_sources.lock() {
                                        map.insert(segment_id.clone(), source_for_asr);
                                    }
                                    let refiner = refiner.clone();
                                    let session_id_clone = session_id.clone();
                                    let segment_id_clone = segment_id.clone();
                                    let audio_samples = temp_audio_buffer.clone();
                                    let tier1_text = final_result.text.clone();
                                    let duration = elapsed - temp_buffer_start_time;
                                    let sample_count = temp_audio_buffer.len();
                                    
                                    // 调度延迟精修（在后台执行）
                                    tokio::spawn(async move {
                                        refiner.schedule(
                                            session_id_clone,
                                            segment_id_clone,
                                            audio_samples,
                                            tier1_text,
                                        ).await;
                                    });
                                    
                                    tracing::debug!(
                                        "已调度延迟精修: segment={}, 时长 {:.1}s, 样本数 {}",
                                        segment_id,
                                        duration,
                                        sample_count
                                    );
                                }
                            }
                            
                            // 清空临时缓冲区
                            temp_audio_buffer.clear();
                        } else {
                            // 没有识别到文本，清空临时缓冲区
                            temp_audio_buffer.clear();
                        }
                        last_partial_text.clear();
                        recognizer.reset();
                    }
                }
            } else {
                // 没有数据时短暂等待
                tokio::time::sleep(tokio::time::Duration::from_millis(5)).await;
            }

            // 主动检查延迟精修任务是否到期
            if let Some(ref refiner) = delayed_refiner {
                refiner.poll_ready().await;
            }
        }
        
        // Session 结束时：立即处理所有待精修的段落
        if let Some(ref refiner) = delayed_refiner {
            let session_id_clone = session_id.clone();
            let refiner_clone = refiner.clone();
            // 同步等待所有待精修任务完成
            refiner_clone.flush_session(&session_id_clone).await;
            tracing::info!("Session 结束，已处理所有待精修段落");
        }

        info!(session_id = %session_id, "Session 音频采集线程结束");
    });
}

/// 合并麦克风和系统音频数据
/// 
/// 注意：如果两个音频源采样率不同，优先使用系统音频（通常包含会议的主要内容）
fn merge_audio_chunks(
    mic: &Option<AudioChunk>,
    system: &Option<AudioChunk>,
) -> Option<AudioChunk> {
    match (mic, system) {
        (Some(m), Some(s)) => {
            // 检查采样率是否一致
            if m.sample_rate != s.sample_rate {
                // 采样率不同，无法直接混合
                // 优先使用系统音频（通常包含会议内容），麦克风用于补充
                // TODO: 未来可以实现重采样后混合
                tracing::debug!(
                    "音频采样率不同: mic={}Hz, system={}Hz, 使用系统音频",
                    m.sample_rate, s.sample_rate
                );
                return Some(s.clone());
            }
            
            // 采样率相同，可以混合
            let len = m.samples.len().min(s.samples.len());
            let mut mixed = Vec::with_capacity(len);
            
            for i in 0..len {
                // 简单混合：平均
                mixed.push((m.samples[i] + s.samples[i]) / 2.0);
            }
            
            Some(AudioChunk {
                samples: mixed,
                sample_rate: m.sample_rate,
                channels: m.channels,
                timestamp_ms: m.timestamp_ms,
            })
        }
        (Some(m), None) => Some(m.clone()),
        (None, Some(s)) => Some(s.clone()),
        (None, None) => None,
    }
}
