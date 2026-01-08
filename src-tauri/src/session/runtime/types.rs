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

pub(crate) struct Tier1Task {
    pub(crate) session_id: String,
    pub(crate) segment_id: String,
    pub(crate) start_time: f64,
    pub(crate) end_time: f64,
    pub(crate) source: TranscriptSource,
    pub(crate) audio_samples: Vec<f32>,
}
