use crate::storage::TranscriptSource;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ActiveSource {
    Microphone,
    System,
}

impl ActiveSource {
    pub(crate) fn to_transcript_source(self) -> TranscriptSource {
        match self {
            ActiveSource::Microphone => TranscriptSource::Microphone,
            ActiveSource::System => TranscriptSource::System,
        }
    }
}

/// 统一的 Worker 任务类型
#[derive(Debug)]
pub(crate) enum WorkerTask {
    /// Tier1 任务：立即处理
    Tier1 {
        segment_id: String,
        buffer_id: u64,
        session_id: String,
        source: TranscriptSource,
        start_time: f64,
        end_time: f64,
    },
    /// Tier2 任务：批量处理
    Tier2 {
        segment_ids: Vec<u64>,
    },
    /// Tier3 任务：批量处理（可选）
    #[allow(dead_code)]
    Tier3 {
        segment_ids: Vec<u64>,
    },
}

// 保留 Tier1Task 用于向后兼容（标记为 deprecated）
#[deprecated(note = "使用 WorkerTask::Tier1 替代")]
pub(crate) struct Tier1Task {
    pub(crate) session_id: String,
    pub(crate) segment_id: String,
    pub(crate) start_time: f64,
    pub(crate) end_time: f64,
    pub(crate) source: TranscriptSource,
    pub(crate) audio_samples: Vec<f32>,
}
