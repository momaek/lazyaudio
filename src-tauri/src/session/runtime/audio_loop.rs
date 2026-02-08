//! Session 音频采集和处理循环
//!
//! 采用面向对象设计，将音频采集、ASR 处理等逻辑封装在 SessionAudioLoop 结构体中

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

use chrono::Utc;
use tracing::{error, info, warn};

use crate::asr::{AsrEngine, AsrRecognizer, AsrProviderType, RecognitionResult, SileroVadWrapper, VadSegment, VAD_MODEL_ID};
use crate::asr::multi_pass::{
    ResultMerger, SegmentBuffer, MultiPassScheduler, SchedulerConfig, Tier2Recognizer,
};
use crate::asr::RecognitionTier;
use crate::audio::{
    AudioCapture, AudioCaptureConfig, AudioChunk, AudioStream, LevelMeter, LimiterConfig,
    MicrophoneCapture, Resampler, SoftLimiter,
};
#[cfg(target_os = "macos")]
use crate::audio::MacOSSystemCapture;
use crate::event::{
    AppEvent, AsrFallbackPayload, AudioLevelPayload, SharedEventBus, TranscriptFinalPayload,
    TranscriptPartialPayload, TranscriptUpdatedPayload,
};
use crate::session::types::SessionId;
use crate::storage::{TranscriptSegment, TranscriptSource};

use super::types::{ActiveSource, WorkerTask};
use super::utils::{build_silero_vad_config, merge_audio_chunks};
use super::worker::spawn_multipass_worker;

/// Session 音频处理循环
///
/// 封装了音频采集、ASR 处理、VAD 切分等所有逻辑
pub(crate) struct SessionAudioLoop {
    // ===== 基础配置 =====
    session_id: SessionId,
    is_running: Arc<AtomicBool>,
    is_paused: Arc<AtomicBool>,

    // ===== 音频配置 =====
    use_microphone: bool,
    use_system_audio: bool,
    merge_for_asr: bool,
    vad_sensitivity: f32,

    // ===== 音频流状态 =====
    mic_stream: Option<AudioStream>,
    system_stream: Option<AudioStream>,
    _mic_capture_holder: Option<MicrophoneCapture>,
    #[cfg(target_os = "macos")]
    _system_capture_holder: Option<MacOSSystemCapture>,

    // ===== 音频处理组件 =====
    mic_level_meter: LevelMeter,
    system_level_meter: LevelMeter,
    #[cfg(target_os = "macos")]
    system_limiter: SoftLimiter,
    resampler: Option<Option<Resampler>>,

    // ===== ASR 组件 =====
    provider_type: AsrProviderType,
    recognizer: Option<Box<dyn AsrRecognizer>>,
    silero_vad: Option<SileroVadWrapper>,
    
    // ===== Multi-pass ASR 组件 =====
    segment_buffer: Arc<tokio::sync::RwLock<SegmentBuffer>>,
    result_merger: Arc<ResultMerger>,
    scheduler: Option<Arc<MultiPassScheduler>>,
    worker_sender: Option<mpsc::Sender<WorkerTask>>,

    // ===== 状态变量 =====
    start_time: Instant,
    last_emit: Instant,
    last_partial_text: String,
    active_source: Option<ActiveSource>,
    allow_separate: bool,
    default_source: TranscriptSource,

    // ===== 音频缓冲 =====
    segment_id_counter: u64,
    temp_audio_buffer: Vec<f32>,
    temp_buffer_start_time: f64,
    vad_audio_buffer: Vec<f32>,
    vad_buffer_start_time: f64,

    // ===== 远端降级追踪 =====
    /// 连续远端 ASR 失败次数
    remote_error_count: u32,
    /// 降级前的原始 Provider 类型名称
    original_provider_name: Option<String>,

    // ===== 共享资源 =====
    event_bus: SharedEventBus,
    asr_engine: Arc<RwLock<AsrEngine>>,
    segment_sources: Arc<Mutex<HashMap<String, TranscriptSource>>>,
}

// ===== impl 1: 构造和初始化 =====
impl SessionAudioLoop {
    /// 创建新的音频处理循环
    pub fn new(
        session_id: SessionId,
        is_running: Arc<AtomicBool>,
        is_paused: Arc<AtomicBool>,
        use_microphone: bool,
        use_system_audio: bool,
        merge_for_asr: bool,
        vad_sensitivity: f32,
        mic_id: Option<String>,
        system_source_id: Option<String>,
        event_bus: SharedEventBus,
        asr_engine: Arc<RwLock<AsrEngine>>,
        recognizer: Option<Box<dyn AsrRecognizer>>,
        provider_type: AsrProviderType,
        app_handle: Option<tauri::AppHandle>,
    ) -> Result<Self, String> {
        info!(
            session_id = %session_id,
            use_microphone,
            use_system_audio,
            has_recognizer = recognizer.is_some(),
            provider = ?provider_type,
            "初始化 Session 音频循环"
        );

        // 初始化麦克风
        let (mic_capture_holder, mic_stream) =
            Self::init_microphone(use_microphone, mic_id)?;

        // 初始化系统音频
        #[cfg(target_os = "macos")]
        let (system_capture_holder, system_stream) =
            Self::init_system_audio(use_system_audio, system_source_id, app_handle)?;

        #[cfg(not(target_os = "macos"))]
        let system_stream: Option<AudioStream> = None;

        // 检查是否有可用音频源
        if mic_stream.is_none() && system_stream.is_none() {
            return Err("没有可用的音频源".to_string());
        }

        // 确定默认音频源
        let default_source = if use_microphone && use_system_audio {
            TranscriptSource::Mixed
        } else if use_microphone {
            TranscriptSource::Microphone
        } else {
            TranscriptSource::System
        };

        let allow_separate = use_microphone && use_system_audio && !merge_for_asr;

        Ok(Self {
            session_id,
            is_running,
            is_paused,
            use_microphone,
            use_system_audio,
            merge_for_asr,
            vad_sensitivity,
            mic_stream,
            system_stream,
            _mic_capture_holder: mic_capture_holder,
            #[cfg(target_os = "macos")]
            _system_capture_holder: system_capture_holder,
            mic_level_meter: LevelMeter::new(4096),
            system_level_meter: LevelMeter::new(4096),
            #[cfg(target_os = "macos")]
            system_limiter: SoftLimiter::new(LimiterConfig {
                enabled: true,
                threshold: 0.9,
                ceiling: 0.99,
                knee: 0.5,
            }),
            resampler: None,
            provider_type,
            recognizer,
            silero_vad: None,
            
            // Multi-pass ASR 组件
            segment_buffer: Arc::new(tokio::sync::RwLock::new(SegmentBuffer::with_defaults())),
            result_merger: Arc::new(ResultMerger::new()),
            scheduler: None,
            worker_sender: None,
            
            start_time: Instant::now(),
            last_emit: Instant::now(),
            last_partial_text: String::new(),
            active_source: None,
            allow_separate,
            default_source,
            segment_id_counter: 0,
            temp_audio_buffer: Vec::new(),
            temp_buffer_start_time: 0.0,
            vad_audio_buffer: Vec::new(),
            vad_buffer_start_time: 0.0,
            remote_error_count: 0,
            original_provider_name: None,
            event_bus,
            asr_engine,
            segment_sources: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    /// 主运行方法
    pub async fn run(mut self) {
        info!(session_id = %self.session_id, "Session 音频采集线程启动");

        // 初始化 ASR 组件
        self.init_asr_components().await;

        // 主循环
        while self.is_running.load(Ordering::SeqCst) {
            if self.is_paused.load(Ordering::SeqCst) {
                tokio::time::sleep(Duration::from_millis(50)).await;
                continue;
            }

            self.process_one_cycle().await;
        }

        // 清理工作
        self.cleanup().await;

        info!(session_id = %self.session_id, "Session 音频采集线程结束");
    }
}

// ===== impl 2: 音频源初始化 =====
impl SessionAudioLoop {
    /// 初始化麦克风采集
    fn init_microphone(
    use_microphone: bool,
    mic_id: Option<String>,
    ) -> Result<(Option<MicrophoneCapture>, Option<AudioStream>), String> {
        if !use_microphone {
            return Ok((None, None));
        }

        let mut capture = MicrophoneCapture::new();
    let config = AudioCaptureConfig::default();
        
        // 获取麦克风源
        let sources = capture
            .list_sources()
            .map_err(|e| format!("获取麦克风列表失败: {}", e))?;

        // 选择麦克风
        let source = if let Some(ref id) = mic_id {
            sources.into_iter().find(|s| s.id == *id)
        } else {
            sources.into_iter().find(|s| s.is_default)
        }
        .ok_or("未找到麦克风")?;

        // 启动采集
        let stream = capture
            .start(&source, &config)
            .map_err(|e| format!("启动麦克风采集失败: {}", e))?;

        Ok((Some(capture), Some(stream)))
    }

    /// 初始化系统音频采集 (macOS)
    #[cfg(target_os = "macos")]
    fn init_system_audio(
        use_system_audio: bool,
        system_source_id: Option<String>,
        app_handle: Option<tauri::AppHandle>,
    ) -> Result<(Option<MacOSSystemCapture>, Option<AudioStream>), String> {
        if !use_system_audio {
            return Ok((None, None));
        }

        use crate::audio::AudioSource;
        let mut capture = MacOSSystemCapture::new(app_handle);
        let config = AudioCaptureConfig::default();
        
        // 获取系统音频源
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
        }
        .ok_or("未找到系统音频源")?;

        // 启动采集
        let stream = capture
            .start(&source, &config)
            .map_err(|e| format!("启动系统音频采集失败: {}", e))?;

        Ok((Some(capture), Some(stream)))
    }
}

// ===== impl 3: ASR 组件初始化 =====
impl SessionAudioLoop {
    /// 初始化所有 ASR 相关组件
    async fn init_asr_components(&mut self) {
        // 1. 设置 ResultMerger 回调
        self.setup_result_merger_callback();

        // 2. Multi-pass 组件（仅本地 Provider 启用）
        if self.provider_type.is_local() {
            // 2a. 初始化并启动 MultiPassScheduler
            self.scheduler = self.init_scheduler().await;

            // 2b. 启动 MultiPassWorker（Worker 会自己创建 Tier1 识别器）
            self.worker_sender = self.spawn_worker();
        } else {
            info!(provider = ?self.provider_type, "远端 Provider，跳过 multi-pass 初始化");
        }

        // 3. 初始化 Silero VAD
        self.silero_vad = self.init_silero_vad();

        // 5. 检查是否可以分路识别
        if self.allow_separate && self.silero_vad.is_none() {
            warn!("VAD 未就绪，无法进行分路识别，将回退为合并模式");
            self.allow_separate = false;
        }

        // 6. 检查 ASR 是否就绪
        if self.recognizer.is_none() && self.worker_sender.is_none() {
            warn!("ASR 识别器未就绪，转录功能将不可用");
        }
    }

    /// 设置 ResultMerger 结果更新回调
    fn setup_result_merger_callback(&self) {
        let event_bus = self.event_bus.clone();
        let session_id = self.session_id.clone();
        let segment_sources = self.segment_sources.clone();

        self.result_merger.set_update_callback(Arc::new(
            move |_seg_id, result| {
                let source = segment_sources
                    .lock()
                    .ok()
                    .and_then(|map| {
                        // 使用 segment_id 作为 key 查找 source
                        // 注意：segment_id 格式为 "session_id_counter"
                        map.get(&result.best_result.segment_id.unwrap_or(0).to_string())
                            .cloned()
                    })
                    .unwrap_or(TranscriptSource::Mixed);

                match result.current_tier {
                    RecognitionTier::Tier1 => {
                        // Tier1 结果 -> transcript:final
                        let segment = TranscriptSegment {
                            id: result.segment_id.to_string(),
                            start_time: 0.0, // TODO: 从 SegmentBuffer 获取
                            end_time: 0.0,
                            text: result.best_result.text.clone(),
                            is_final: true,
                            confidence: Some(result.best_result.confidence),
                            source: Some(source),
                            speaker_id: None,
                            speaker_label: None,
                            language: None,
                            words: None,
                            created_at: Utc::now().to_rfc3339(),
                            tier: Some("tier1".to_string()),
                        };

                        event_bus.publish(AppEvent::TranscriptFinal(TranscriptFinalPayload {
                            session_id: session_id.clone(),
                            segment,
                        }));
                    }
                    RecognitionTier::Tier2 | RecognitionTier::Tier3 => {
                        // Tier2/3 结果 -> transcript:updated（原地替换）
                        let tier_str = result.current_tier.as_str();
                        let segment = TranscriptSegment {
                            id: result.segment_id.to_string(),
                            start_time: 0.0, // TODO: 从 SegmentBuffer 获取
                            end_time: 0.0,
                            text: result.best_result.text.clone(),
                            is_final: true,
                            confidence: Some(result.best_result.confidence),
                            source: Some(source),
                            speaker_id: None,
                            speaker_label: None,
                            language: None,
                            words: None,
                            created_at: Utc::now().to_rfc3339(),
                            tier: Some(tier_str.to_string()),
                        };

                        event_bus.publish(AppEvent::TranscriptUpdated(
                            TranscriptUpdatedPayload {
                                session_id: session_id.clone(),
                                segment_id: result.segment_id.to_string(),
                                tier: tier_str.to_string(),
                                text: result.best_result.text.clone(),
                                confidence: result.best_result.confidence,
                                segment,
                            },
                        ));

                        info!(
                            "✨ {} 精修完成: segment={}",
                            tier_str,
                            result.segment_id
                        );
                    }
                }
            },
        ));

        info!("ResultMerger 回调已设置");
    }

    /// 初始化并启动 MultiPassScheduler
    async fn init_scheduler(&self) -> Option<Arc<MultiPassScheduler>> {
        let config = SchedulerConfig {
            enable_tier2: true,
            tier2_interval_secs: 5,
            tier2_batch_size: 10,
            enable_tier3: false,
            tier3_interval_secs: 60,
            tier3_batch_size: 20,
        };

        let mut scheduler = MultiPassScheduler::new(
            config,
            self.segment_buffer.clone(),
            self.result_merger.clone(),
        );

        // 尝试加载 Tier2 识别器（SenseVoice）
        if let Ok(tier2_rec) = self.load_tier2_recognizer() {
            scheduler.set_tier2_recognizer(Arc::new(tokio::sync::RwLock::new(tier2_rec)));
            info!("Tier2 识别器已加载");
        } else {
            warn!("Tier2 识别器加载失败，Tier2 功能将不可用");
        }

        let scheduler = Arc::new(scheduler);
        scheduler.start().await;

        info!("MultiPassScheduler 已启动");
        Some(scheduler)
    }

    /// 加载 Tier2 识别器
    fn load_tier2_recognizer(&self) -> Result<Tier2Recognizer, String> {
        let sense_voice_model_id = "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17";
        let model_dir = dirs::data_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("LazyAudio")
            .join("models")
            .join(sense_voice_model_id);

        if !model_dir.exists() {
            return Err(format!("SenseVoice 模型未下载: {}", model_dir.display()));
        }

        Tier2Recognizer::from_model_dir(&model_dir, 2)
            .map_err(|e| format!("加载 Tier2 识别器失败: {}", e))
    }

    /// 启动 MultiPassWorker
    fn spawn_worker(&self) -> Option<mpsc::Sender<WorkerTask>> {
        // 加载 Tier2 识别器（可选）
        let tier2_recognizer = self.load_tier2_recognizer().ok();

        spawn_multipass_worker(
            self.segment_buffer.clone(),
            self.result_merger.clone(),
            self.asr_engine.clone(),
            tier2_recognizer,
            self.event_bus.clone(),
            self.provider_type,
        )
    }

    /// 初始化 Silero VAD
    fn init_silero_vad(&self) -> Option<SileroVadWrapper> {
        let vad_model_dir = dirs::data_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("LazyAudio")
            .join("models")
            .join(VAD_MODEL_ID);

        if !vad_model_dir.exists() {
            warn!(
                "Silero VAD 模型未下载: {}，使用 endpoint 检测",
                vad_model_dir.display()
            );
            return None;
        }

        let vad_config = build_silero_vad_config(self.vad_sensitivity);

        match SileroVadWrapper::from_model_dir(&vad_model_dir, vad_config) {
            Ok(vad) => {
                let vad_config = vad.config();
                info!(
                    "Silero VAD 已加载，用于精确语音切分 (threshold={:.2}, min_silence={:.2}s, max_speech={:.1}s)",
                    vad_config.threshold,
                    vad_config.min_silence_duration,
                    vad_config.max_speech_duration
                );
                Some(vad)
            }
            Err(e) => {
                warn!("加载 Silero VAD 失败: {}，使用 endpoint 检测", e);
                None
            }
        }
    }
}

// ===== impl 4: 音频采集和源选择 =====
impl SessionAudioLoop {
    /// 采集音频数据
    async fn collect_audio_chunks(&mut self) -> (Option<AudioChunk>, Option<AudioChunk>) {
        let mic_chunk = self.receive_mic_chunk().await;
        let system_chunk = self.receive_system_chunk().await;
        (mic_chunk, system_chunk)
    }

    /// 接收麦克风音频
    async fn receive_mic_chunk(&mut self) -> Option<AudioChunk> {
        if let Some(ref mut stream) = self.mic_stream {
                tokio::select! {
                    biased;
                    chunk = stream.recv() => chunk,
                _ = tokio::time::sleep(Duration::from_millis(10)) => None,
                }
            } else {
                None
        }
    }

    /// 接收系统音频
            #[cfg(target_os = "macos")]
    async fn receive_system_chunk(&mut self) -> Option<AudioChunk> {
        if let Some(ref mut stream) = self.system_stream {
                tokio::select! {
                    biased;
                    chunk = stream.recv() => {
                        // 应用限幅器
                    chunk.map(|c| self.system_limiter.process(&c))
                    },
                _ = tokio::time::sleep(Duration::from_millis(10)) => None,
                }
            } else {
                None
        }
    }
            
            #[cfg(not(target_os = "macos"))]
    async fn receive_system_chunk(&mut self) -> Option<AudioChunk> {
        if let Some(ref mut stream) = self.system_stream {
                tokio::select! {
                    biased;
                    chunk = stream.recv() => chunk,
                _ = tokio::time::sleep(Duration::from_millis(10)) => None,
                }
            } else {
                None
        }
    }

    /// 选择用于 ASR 的音频源
    fn select_audio_source(
        &mut self,
        mic_chunk: &Option<AudioChunk>,
        system_chunk: &Option<AudioChunk>,
    ) -> (Option<AudioChunk>, TranscriptSource) {
        if !self.allow_separate {
            return (
                merge_audio_chunks(mic_chunk, system_chunk),
                self.default_source,
            );
        }

        // 能量检测 + VAD 逻辑
        let vad_is_speech = self
            .silero_vad
                    .as_ref()
            .map(|v| v.is_speech())
            .unwrap_or(false);

        let mic_energy = Self::calculate_energy(mic_chunk);
        let system_energy = Self::calculate_energy(system_chunk);

        let next_source = self.determine_active_source(mic_energy, system_energy, vad_is_speech);

        // 处理源切换
        if next_source != self.active_source {
            self.handle_source_switch(next_source);
        }

        match next_source {
            Some(ActiveSource::Microphone) => (mic_chunk.clone(), TranscriptSource::Microphone),
            Some(ActiveSource::System) => (system_chunk.clone(), TranscriptSource::System),
            None => (None, self.default_source),
        }
    }

    /// 计算音频能量
    fn calculate_energy(chunk: &Option<AudioChunk>) -> f32 {
        chunk
                    .as_ref()
                    .map(|chunk| {
                        let sum = chunk.samples.iter().map(|s| s * s).sum::<f32>();
                        (sum / chunk.samples.len().max(1) as f32).sqrt()
                    })
            .unwrap_or(0.0)
    }

    /// 确定激活的音频源
    fn determine_active_source(
        &self,
        mic_energy: f32,
        system_energy: f32,
        vad_is_speech: bool,
    ) -> Option<ActiveSource> {
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

        if let Some(current) = self.active_source {
                    if vad_is_speech {
                        Some(current)
                    } else {
                        select_source(Some(current))
                    }
                } else {
                    select_source(None)
        }
    }

    /// 处理音频源切换
    fn handle_source_switch(&mut self, new_source: Option<ActiveSource>) {
        self.active_source = new_source;
        self.last_partial_text.clear();
        self.temp_audio_buffer.clear();
        self.vad_audio_buffer.clear();

        if let Some(ref mut vad) = self.silero_vad {
                        vad.reset();
                    }
        if let Some(ref mut rec) = self.recognizer {
                        rec.reset();
                    }
        self.resampler = None;
    }
}

// ===== impl 5: 音频电平处理 =====
impl SessionAudioLoop {
    /// 更新音频电平
    fn update_audio_levels(
        &mut self,
        mic_chunk: &Option<AudioChunk>,
        system_chunk: &Option<AudioChunk>,
    ) {
                if let Some(ref mc) = mic_chunk {
            self.mic_level_meter.push_samples(&mc.samples);
                }
                if let Some(ref sc) = system_chunk {
            self.system_level_meter.push_samples(&sc.samples);
        }
    }

    /// 发送音频电平事件
    fn emit_audio_level_event(&mut self) {
        if self.last_emit.elapsed() < Duration::from_millis(100) {
            return;
        }

        let combined_level = self
            .mic_level_meter
            .get_smoothed_level()
            .max(self.system_level_meter.get_smoothed_level());
        let combined_db = self
            .mic_level_meter
            .get_smoothed_db()
            .max(self.system_level_meter.get_smoothed_db());

        self.event_bus.publish(AppEvent::AudioLevel(AudioLevelPayload {
            session_id: self.session_id.clone(),
                        level: combined_level,
                        db: combined_db,
                    }));
                    
        self.last_emit = Instant::now();
    }
}

// ===== impl 6: ASR 处理（核心逻辑）=====
impl SessionAudioLoop {
    /// 处理音频进行 ASR
    fn process_audio_for_asr(&mut self, chunk: &AudioChunk, source: TranscriptSource) {
        if self.recognizer.is_none() {
            return;
        }

        // 准备 ASR 样本
        let samples = match self.prepare_asr_samples(chunk) {
            Ok(s) => s,
                                Err(e) => {
                warn!("音频预处理失败: {}", e);
                return;
            }
        };

        // 根据是否有 VAD 选择处理模式
        let has_vad = self.silero_vad.is_some();
        if has_vad {
            self.process_with_vad_internal(&samples, source);
        } else {
            self.process_with_endpoint_internal(&samples, source);
        }
    }

    /// 准备用于 ASR 的音频样本
    fn prepare_asr_samples(&mut self, chunk: &AudioChunk) -> Result<Vec<f32>, String> {
        // 初始化 resampler（如果需要）
        if self.resampler.is_none() {
            self.init_resampler(chunk.sample_rate);
        }

        // 转单声道
        let mono = if chunk.channels == 2 {
            chunk
                .samples
                .chunks(2)
                .map(|s| (s[0] + s[1]) / 2.0)
                .collect()
                    } else {
                        chunk.samples.clone()
                    };
                    
        // 重采样（如果需要）
        match &mut self.resampler {
            Some(Some(ref mut r)) => r
                .process(&mono)
                .map_err(|e| format!("重采样失败: {}", e)),
            _ => Ok(mono),
        }
    }

    /// 初始化重采样器
    fn init_resampler(&mut self, sample_rate: u32) {
        info!(
            "首次收到音频: sample_rate={}Hz",
            sample_rate
        );

        if sample_rate == 16000 {
            info!("音频输入已经是 16kHz，无需重采样");
            self.resampler = Some(None);
        } else {
            info!("音频输入 {}Hz，创建重采样器到 16kHz", sample_rate);
            match Resampler::new(sample_rate, 16000, 1) {
                Ok(r) => self.resampler = Some(Some(r)),
                                Err(e) => {
                    warn!("创建 resampler 失败: {}", e);
                    self.resampler = Some(None);
                }
            }
        }
    }

    /// VAD 模式的 ASR 处理（内部实现）
    fn process_with_vad_internal(&mut self, samples: &[f32], source: TranscriptSource) {
        // 缓冲音频
        if self.vad_audio_buffer.is_empty() {
            self.vad_buffer_start_time = self.start_time.elapsed().as_secs_f64();
        }
        self.vad_audio_buffer.extend_from_slice(samples);

        // VAD 检测
        let vad_segments = if let Some(ref mut vad) = self.silero_vad {
            vad.process(samples)
        } else {
            return;
        };

        // 流式 ASR（实时反馈）
        let mut remote_err: Option<String> = None;
        if let Some(ref mut recognizer) = self.recognizer {
            if let Err(e) = recognizer.accept_waveform(samples) {
                warn!("ASR accept_waveform 失败: {}", e);
                if self.provider_type.is_remote() {
                    remote_err = Some(e.to_string());
                }
            }
            let result = recognizer.get_result().unwrap_or_else(|e| {
                warn!("ASR get_result 失败: {}", e);
                RecognitionResult::empty()
            });
            let elapsed = self.start_time.elapsed().as_secs_f64();
            self.emit_partial_result(&result, self.vad_buffer_start_time, elapsed);
        }
        if let Some(err) = remote_err {
            self.handle_remote_error(&err);
        }

        // 处理完整段落
        for vad_segment in vad_segments {
            self.handle_vad_segment_internal(vad_segment, source);
        }

        // 同时缓存到 temp_audio_buffer
        if self.temp_audio_buffer.is_empty() {
            self.temp_buffer_start_time = self.start_time.elapsed().as_secs_f64();
        }
        self.temp_audio_buffer.extend_from_slice(samples);
    }

    /// Endpoint 模式的 ASR 处理（内部实现）
    fn process_with_endpoint_internal(&mut self, samples: &[f32], source: TranscriptSource) {
        // 缓存音频
        if self.temp_audio_buffer.is_empty() {
            self.temp_buffer_start_time = self.start_time.elapsed().as_secs_f64();
        }
        self.temp_audio_buffer.extend_from_slice(samples);

        // 处理 ASR
        let mut remote_err: Option<String> = None;
        let (result, is_endpoint) = if let Some(ref mut recognizer) = self.recognizer {
            if let Err(e) = recognizer.accept_waveform(samples) {
                warn!("ASR accept_waveform 失败: {}", e);
                if self.provider_type.is_remote() {
                    remote_err = Some(e.to_string());
                }
            }
            let result = recognizer.get_result().unwrap_or_else(|e| {
                warn!("ASR get_result 失败: {}", e);
                RecognitionResult::empty()
            });
            let is_endpoint = recognizer.is_endpoint();
            (Some(result), is_endpoint)
        } else {
            (None, false)
        };
        if let Some(err) = remote_err {
            self.handle_remote_error(&err);
        }

        // 处理结果
        if let Some(result) = result {
            if !result.text.is_empty() {
                if result.is_final {
                    self.last_partial_text.clear();
                    if let Some(ref mut recognizer) = self.recognizer {
                        recognizer.reset();
                    }
                } else if result.text != self.last_partial_text {
                    let elapsed = self.start_time.elapsed().as_secs_f64();
                    self.last_partial_text = result.text.clone();
                    self.event_bus
                        .publish(AppEvent::TranscriptPartial(TranscriptPartialPayload {
                            session_id: self.session_id.clone(),
                            text: result.text,
                            start_time: self.temp_buffer_start_time,
                            end_time: elapsed,
                            confidence: Some(result.confidence),
                            }));
                }
            }
        }

        // 检查 endpoint
        if is_endpoint {
            self.handle_endpoint_internal(source);
        }
    }

    /// 发送实时识别结果
    fn emit_partial_result(&mut self, result: &RecognitionResult, start_time: f64, end_time: f64) {
        if !result.text.is_empty() && result.text != self.last_partial_text {
            self.last_partial_text = result.text.clone();
            self.event_bus
                .publish(AppEvent::TranscriptPartial(TranscriptPartialPayload {
                    session_id: self.session_id.clone(),
                    text: result.text.clone(),
                    start_time,
                    end_time,
                    confidence: Some(result.confidence),
                }));
        }
    }

    /// 处理 VAD 检测到的语音段落（内部实现）
    fn handle_vad_segment_internal(&mut self, vad_segment: VadSegment, source: TranscriptSource) {
        let elapsed = self.start_time.elapsed().as_secs_f64();

        // 1. 存入 SegmentBuffer
        let buffer_id = {
            let mut buffer = self.segment_buffer.try_write()
                .expect("无法获取 SegmentBuffer 写锁");
            buffer.push(
                vad_segment.samples.clone(),
                self.vad_buffer_start_time,
                elapsed,
            )
        };

        // 2. 生成 segment_id 并记录 source
        self.segment_id_counter += 1;
        let segment_id = format!("{}_{}", self.session_id, self.segment_id_counter);

        if let Ok(mut map) = self.segment_sources.lock() {
            map.insert(segment_id.clone(), source);
        }

        // 3. 处理识别
        if let Some(ref sender) = self.worker_sender {
            // 本地 Provider：发送给 MultiPassWorker（支持 Tier1/2/3）
            let task = WorkerTask::Tier1 {
                segment_id: segment_id.clone(),
                buffer_id,
                session_id: self.session_id.clone(),
                source,
                start_time: self.vad_buffer_start_time,
                end_time: elapsed,
            };
            let _ = sender.send(task);

            info!(
                "VAD 段落已存入 SegmentBuffer 并发送 Tier1 任务: buffer_id={}, segment={}",
                buffer_id, segment_id
            );
        } else if self.provider_type.is_remote() {
            // 远端 Provider（如 Whisper）：直接使用 recognizer.finalize() 批量识别
            self.process_vad_segment_remote(
                &vad_segment,
                &segment_id,
                source,
                self.vad_buffer_start_time,
                elapsed,
            );
        } else {
            warn!("MultiPassWorker 未就绪且非远端 Provider，跳过段落处理");
        }

        // 4. 清理
        self.vad_audio_buffer.clear();
        self.last_partial_text.clear();
    }

    /// 远端 Provider 处理 VAD 段落
    ///
    /// 对于流式 Provider（如 Deepgram），音频已经通过 accept_waveform 发送，
    /// 这里只需调用 finalize 获取累积结果。
    /// 对于批量 Provider（如 Whisper），音频也已在主循环 accept_waveform 中缓冲，
    /// finalize 时一并发送。
    ///
    /// 注意：不再重复调用 accept_waveform，避免 double-send。
    fn process_vad_segment_remote(
        &mut self,
        _vad_segment: &VadSegment,
        segment_id: &str,
        source: TranscriptSource,
        start_time: f64,
        end_time: f64,
    ) {
        let Some(ref mut recognizer) = self.recognizer else {
            warn!("远端识别器未就绪，跳过段落处理");
            return;
        };

        // 直接调用 finalize 获取结果（音频已在主循环中通过 accept_waveform 发送/缓冲）
        let final_result = match recognizer.finalize() {
            Ok(r) => {
                // 远端成功：重置错误计数
                self.remote_error_count = 0;
                r
            }
            Err(e) => {
                warn!("远端 ASR finalize 失败: {}", e);
                recognizer.reset();
                self.handle_remote_error(&e.to_string());
                return;
            }
        };
        recognizer.reset();

        if final_result.text.is_empty() {
            return;
        }

        info!(
            provider = ?self.provider_type,
            text_len = final_result.text.len(),
            "远端 ASR 段落识别完成: segment={}",
            segment_id
        );

        // 发送最终识别事件
        self.emit_final_segment(
            segment_id,
            start_time,
            end_time,
            &final_result.text,
            final_result.confidence,
            source,
            "tier1", // 远端 Provider 的结果视为 tier1
        );
    }

    /// 连续失败阈值（达到此次数后自动降级到本地）
    const REMOTE_FALLBACK_THRESHOLD: u32 = 3;

    /// 处理远端 ASR 错误，达到阈值后自动降级
    fn handle_remote_error(&mut self, error_msg: &str) {
        self.remote_error_count += 1;
        warn!(
            provider = ?self.provider_type,
            error_count = self.remote_error_count,
            threshold = Self::REMOTE_FALLBACK_THRESHOLD,
            "远端 ASR 错误: {}",
            error_msg
        );

        if self.remote_error_count >= Self::REMOTE_FALLBACK_THRESHOLD {
            self.fallback_to_local();
        }
    }

    /// 自动降级到本地 ASR Provider
    fn fallback_to_local(&mut self) {
        let from_provider_name = self.provider_type.display_name().to_string();
        info!(
            from = %from_provider_name,
            "远端 ASR 连续失败 {} 次，自动降级到本地 Provider",
            Self::REMOTE_FALLBACK_THRESHOLD
        );

        // 保存原始 Provider 名称（仅首次降级时记录）
        if self.original_provider_name.is_none() {
            self.original_provider_name = Some(from_provider_name.clone());
        }

        // 释放旧的远端 recognizer
        if let Some(ref mut rec) = self.recognizer {
            rec.full_reset();
        }
        self.recognizer = None;

        // 尝试创建本地 recognizer
        let local_recognizer = match self.asr_engine.read() {
            Ok(engine) => engine.create_recognizer_for_provider(AsrProviderType::Local, None),
            Err(e) => {
                error!("获取 ASR 引擎读锁失败: {}。无法降级", e);
                return;
            }
        };

        match local_recognizer {
            Ok(recognizer) => {
                self.recognizer = Some(recognizer);
                self.provider_type = AsrProviderType::Local;
                self.remote_error_count = 0;

                info!("已成功降级到本地 ASR Provider");

                // 发送降级事件通知前端
                self.event_bus.publish(AppEvent::AsrFallback(AsrFallbackPayload {
                    session_id: self.session_id.clone(),
                    from_provider: from_provider_name,
                    to_provider: AsrProviderType::Local.display_name().to_string(),
                    reason: format!(
                        "远端 ASR 连续失败 {} 次，已自动切换到本地识别",
                        Self::REMOTE_FALLBACK_THRESHOLD
                    ),
                }));
            }
            Err(e) => {
                error!("降级到本地 ASR 失败: {}。转录功能不可用", e);
            }
        }
    }

    /// 处理最终识别结果（内部实现）
    fn handle_final_result_internal(
        &mut self,
        _result: RecognitionResult,
        _source: TranscriptSource,
    ) {
        self.last_partial_text.clear();
        if let Some(ref mut recognizer) = self.recognizer {
                            recognizer.reset();
                        }
                        }
                        
    /// 处理 Endpoint 检测到的完整句子（内部实现）
    fn handle_endpoint_internal(&mut self, source: TranscriptSource) {
        // 获取最终识别结果
        let final_result = if let Some(ref mut recognizer) = self.recognizer {
            recognizer.finalize().unwrap_or_else(|e| {
                warn!("ASR finalize 失败: {}", e);
                RecognitionResult::empty()
            })
        } else {
            return;
        };

        if final_result.text.is_empty() {
            self.temp_audio_buffer.clear();
            self.last_partial_text.clear();
            if let Some(ref mut recognizer) = self.recognizer {
                recognizer.reset();
            }
            return;
        }

        self.segment_id_counter += 1;
        let segment_id = format!("{}_{}", self.session_id, self.segment_id_counter);
        let elapsed = self.start_time.elapsed().as_secs_f64();

        self.emit_final_segment(
            &segment_id,
            self.temp_buffer_start_time,
            elapsed,
            &final_result.text,
            final_result.confidence,
            source,
            "tier0",  // Stream endpoint 检测，标记为 tier0
        );

        // 清理
        self.temp_audio_buffer.clear();
        self.last_partial_text.clear();
        if let Some(ref mut recognizer) = self.recognizer {
                                recognizer.reset();
        }
    }

    /// 发送最终识别段落
    fn emit_final_segment(
        &self,
        segment_id: &str,
        start_time: f64,
        end_time: f64,
        text: &str,
        confidence: f32,
        source: TranscriptSource,
        tier: &str,
    ) {
                            let segment = TranscriptSegment {
            id: segment_id.to_string(),
            start_time,
            end_time,
            text: text.to_string(),
                                is_final: true,
            confidence: Some(confidence),
            source: Some(source),
            speaker_id: None,
            speaker_label: None,
                                language: None,
                                words: None,
                                created_at: Utc::now().to_rfc3339(),
                                    tier: Some(tier.to_string()),
                                };
                                
        self.event_bus
            .publish(AppEvent::TranscriptFinal(TranscriptFinalPayload {
                session_id: self.session_id.clone(),
                                segment,
                            }));
    }

}

// ===== impl 7: 主循环和清理 =====
impl SessionAudioLoop {
    /// 处理一个循环周期
    async fn process_one_cycle(&mut self) {
        // 1. 采集音频
        let (mic_chunk, system_chunk) = self.collect_audio_chunks().await;

        // 2. 选择音频源
        let (audio_for_asr, source) = self.select_audio_source(&mic_chunk, &system_chunk);

        // 3. 更新电平
        self.update_audio_levels(&mic_chunk, &system_chunk);
        self.emit_audio_level_event();

        // 4. ASR 处理
        if let Some(chunk) = audio_for_asr {
            self.process_audio_for_asr(&chunk, source);
                        } else {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }

        }
        
    /// 清理工作
    async fn cleanup(&mut self) {
        // 1. 处理远端 Provider 残留的音频 buffer
        if self.provider_type.is_remote() {
            if let Some(ref mut recognizer) = self.recognizer {
                match recognizer.finalize() {
                    Ok(result) if !result.is_empty() => {
                        let elapsed = self.start_time.elapsed().as_secs_f64();
                        self.segment_id_counter += 1;
                        let segment_id = format!("{}_{}", self.session_id, self.segment_id_counter);
                        info!(
                            provider = ?self.provider_type,
                            "Session 停止时处理残留音频: segment={}",
                            segment_id
                        );
                        self.emit_final_segment(
                            &segment_id,
                            self.temp_buffer_start_time,
                            elapsed,
                            &result.text,
                            result.confidence,
                            self.default_source,
                            "tier1",
                        );
                    }
                    Ok(_) => {} // 空结果，无需处理
                    Err(e) => warn!("Session 停止时 finalize 失败: {}", e),
                }
            }
        }

        // 2. 停止 MultiPassScheduler
        if let Some(ref scheduler) = self.scheduler {
            scheduler.stop().await;
            info!("MultiPassScheduler 已停止");
        }
    }
}

// ===== 公开 API =====

/// 运行 Session 音频采集和处理
pub(crate) fn run_session_audio(
    session_id: SessionId,
    is_running: Arc<AtomicBool>,
    is_paused: Arc<AtomicBool>,
    use_microphone: bool,
    use_system_audio: bool,
    merge_for_asr: bool,
    vad_sensitivity: f32,
    mic_id: Option<String>,
    system_source_id: Option<String>,
    event_bus: SharedEventBus,
    asr_engine: Arc<RwLock<AsrEngine>>,
    recognizer: Option<Box<dyn AsrRecognizer>>,
    provider_type: AsrProviderType,
    app_handle: Option<tauri::AppHandle>,
) {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("Failed to create tokio runtime");

    rt.block_on(async {
        match SessionAudioLoop::new(
            session_id,
            is_running,
            is_paused,
            use_microphone,
            use_system_audio,
            merge_for_asr,
            vad_sensitivity,
            mic_id,
            system_source_id,
            event_bus,
            asr_engine,
            recognizer,
            provider_type,
            app_handle,
        ) {
            Ok(audio_loop) => audio_loop.run().await,
            Err(e) => error!("初始化音频循环失败: {}", e),
        }
    });
}
