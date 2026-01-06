//! Session 运行时模块
//!
//! 管理 Session 的音频采集和 ASR 处理

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use std::thread::JoinHandle;

use chrono::Utc;
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::asr::{AsrEngine, StreamingRecognizer};
use crate::asr::multi_pass::SegmentBuffer;
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
        
        // 尝试创建识别器（使用 catch_unwind 防止 C++ 异常导致崩溃）
        let asr_engine_clone = self.asr_engine.clone();
        let recognizer = std::thread::spawn(move || {
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let engine = asr_engine_clone.read().expect("获取 ASR 锁失败");
                engine.create_recognizer().ok()
            }))
            .ok()
            .flatten()
        })
        .join()
        .ok()
        .flatten();

        if recognizer.is_some() {
            info!("ASR 识别器创建成功");
        } else {
            warn!("ASR 识别器创建失败，转录功能将不可用（可能需要重新下载模型）");
        }

        // 在独立线程中运行音频采集
        let thread_handle = std::thread::spawn(move || {
            run_session_audio(
                session_id_clone,
                is_running_clone,
                is_paused_clone,
                use_microphone,
                use_system_audio,
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

        // Recognizer（可能没有）
        let mut recognizer = recognizer;

        // Multi-pass: 段落缓冲器（用于缓存音频供 Tier 2 识别）
        let mut segment_buffer = SegmentBuffer::with_defaults();
        let mut segment_id_counter: u64 = 0;
        
        // 临时音频缓冲区（用于收集一个语音段落的所有音频数据）
        let mut temp_audio_buffer: Vec<f32> = Vec::new();
        let mut temp_buffer_start_time: f64 = 0.0;

        // Multi-pass: segment_id 到 buffer_id 的映射（用于 Tier 2 更新）
        let mut segment_id_to_buffer_id: std::collections::HashMap<String, u64> = std::collections::HashMap::new();
        
        // Tier 2 调度相关
        let mut tier2_last_check = std::time::Instant::now();
        let tier2_check_interval = std::time::Duration::from_secs(5); // 每 5 秒检查一次
        
        // Multi-pass: Tier 2 调度
        // 注意：这里简化处理，Tier 2 暂时不使用单独的识别器
        // 而是直接将 tier1 的结果标记为 tier2（模拟确认）
        // TODO: 实际应该使用更大的离线模型来提高准确率
        let tier2_enabled = recognizer.is_some();
        if tier2_enabled {
            info!("Multi-pass: Tier 2 已启用（5秒后自动确认）");
        }

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

            // 合并音频数据用于 ASR
            let audio_for_asr = merge_audio_chunks(&mic_chunk, &system_chunk);
            
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
                    
                    // 送入 ASR
                    recognizer.accept_waveform(&samples_for_asr);
                    
                    // Multi-pass: 缓存音频数据供 Tier 2/3 使用
                    if temp_audio_buffer.is_empty() {
                        temp_buffer_start_time = start_time.elapsed().as_secs_f64();
                    }
                    temp_audio_buffer.extend_from_slice(&samples_for_asr);
                    
                    // 获取结果
                    let result = recognizer.get_result();
                    
                    // 调试：每秒输出一次 ASR 状态
                    static mut LAST_DEBUG: Option<std::time::Instant> = None;
                    unsafe {
                        let should_debug = match LAST_DEBUG {
                            Some(t) => t.elapsed() > std::time::Duration::from_secs(3),
                            None => true,
                        };
                        if should_debug {
                            LAST_DEBUG = Some(std::time::Instant::now());
                            let processed = recognizer.processed_duration_secs();
                            tracing::debug!(
                                "ASR 状态: 已处理 {:.1}s, 当前结果: '{}'",
                                processed,
                                if result.text.is_empty() { "<空>" } else { &result.text }
                            );
                        }
                    }
                    
                    // 如果有文本且不是空的
                    if !result.text.is_empty() {
                        if result.is_final {
                            // 最终结果（这个分支理论上不应该触发，因为 is_endpoint 会先处理）
                            let elapsed = start_time.elapsed().as_secs_f64();
                            let segment = TranscriptSegment {
                                id: Uuid::new_v4().to_string(),
                                start_time: elapsed - 2.0, // 估算
                                end_time: elapsed,
                                text: result.text.clone(),
                                is_final: true,
                                confidence: Some(result.confidence),
                                source: Some(TranscriptSource::Mixed),
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
                            info!("发布转录事件: partial, text='{}'", result.text);
                            last_partial_text = result.text.clone();
                            event_bus.publish(AppEvent::TranscriptPartial(TranscriptPartialPayload {
                                session_id: session_id.clone(),
                                text: result.text,
                                confidence: Some(result.confidence),
                            }));
                        }
                    }
                    
                    // 检查端点（说话结束）
                    if recognizer.is_endpoint() {
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
                                source: Some(TranscriptSource::Mixed),
                                language: None,
                                words: None,
                                created_at: Utc::now().to_rfc3339(),
                                tier: Some("tier1".to_string()),  // Multi-pass: Tier 1 实时识别
                            };
                            
                            // Multi-pass: 缓存音频段落供 Tier 2 使用
                            if !temp_audio_buffer.is_empty() {
                                let buffer_id = segment_buffer.push(
                                    temp_audio_buffer.clone(),
                                    temp_buffer_start_time,
                                    elapsed,
                                );
                                // 记录 segment_id 到 buffer_id 的映射
                                segment_id_to_buffer_id.insert(segment_id.clone(), buffer_id);
                                info!(
                                    "Multi-pass: 缓存段落 #{} (buffer_id={}), 时长 {:.1}s, 样本数 {}",
                                    segment_id_counter,
                                    buffer_id,
                                    elapsed - temp_buffer_start_time,
                                    temp_audio_buffer.len()
                                );
                                temp_audio_buffer.clear();
                            }
                            
                            event_bus.publish(AppEvent::TranscriptFinal(TranscriptFinalPayload {
                                session_id: session_id.clone(),
                                segment,
                            }));
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

            // ========== Multi-pass: Tier 2 调度 ==========
            // 定期检查是否有待处理的段落需要 Tier 2 识别
            if tier2_last_check.elapsed() >= tier2_check_interval {
                tier2_last_check = std::time::Instant::now();
                
                // 获取待处理的段落
                let pending = segment_buffer.get_pending_tier2(5); // 每次最多处理 5 个
                
                if !pending.is_empty() {
                    info!("Multi-pass Tier 2: 检查 {} 个待处理段落", pending.len());
                    
                    // 收集需要处理的段落信息
                    let pending_info: Vec<(u64, Vec<f32>)> = pending
                        .iter()
                        .map(|seg| (seg.id, seg.samples.clone()))
                        .collect();
                    
                    for (buffer_id, samples) in pending_info {
                        // 查找对应的 segment_id
                        let segment_id_opt = segment_id_to_buffer_id
                            .iter()
                            .find(|(_, &bid)| bid == buffer_id)
                            .map(|(sid, _)| sid.clone());
                        
                        if let Some(seg_id) = segment_id_opt {
                            // 执行 Tier 2 识别（这里简化为直接使用相同的识别结果）
                            // 实际上应该使用离线模型重新识别
                            // TODO: 集成真正的 Tier 2 离线识别器
                            
                            // 暂时模拟：将 tier 从 tier1 更新为 tier2
                            let elapsed = start_time.elapsed().as_secs_f64();
                            let segment = TranscriptSegment {
                                id: seg_id.clone(),
                                start_time: 0.0, // 会被前端忽略
                                end_time: elapsed,
                                text: "".to_string(), // 会被前端使用原有文本
                                is_final: true,
                                confidence: Some(0.95), // Tier 2 通常置信度更高
                                source: Some(TranscriptSource::Mixed),
                                language: None,
                                words: None,
                                created_at: Utc::now().to_rfc3339(),
                                tier: Some("tier2".to_string()),
                            };
                            
                            // 发送更新事件
                            event_bus.publish(AppEvent::TranscriptUpdated(TranscriptUpdatedPayload {
                                session_id: session_id.clone(),
                                segment_id: seg_id.clone(),
                                tier: "tier2".to_string(),
                                text: "".to_string(), // 暂时为空，实际应该是 Tier 2 识别结果
                                confidence: 0.95,
                                segment,
                            }));
                            
                            info!("Multi-pass Tier 2: 已更新段落 {}", seg_id);
                            
                            // 标记为已处理
                            segment_buffer.mark_tier2_processed(buffer_id);
                        }
                    }
                }
            }
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
