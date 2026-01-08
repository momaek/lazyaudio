use std::collections::HashMap;
use std::sync::{mpsc, Arc, Mutex, RwLock};
use std::time::Duration;

use chrono::Utc;
use tracing::warn;

use crate::asr::AsrEngine;
use crate::asr::multi_pass::DelayedRefiner;
use crate::event::{AppEvent, SharedEventBus, TranscriptFinalPayload};
use crate::storage::{TranscriptSegment, TranscriptSource};

use super::types::Tier1Task;

pub(crate) fn spawn_tier1_worker(
    asr_engine: Arc<RwLock<AsrEngine>>,
    event_bus: SharedEventBus,
    delayed_refiner: Option<Arc<DelayedRefiner>>,
    segment_sources: Arc<Mutex<HashMap<String, TranscriptSource>>>,
) -> Option<mpsc::Sender<Tier1Task>> {
    let (tx, rx) = mpsc::channel::<Tier1Task>();
    let (ready_tx, ready_rx) = mpsc::channel::<bool>();

    std::thread::spawn(move || {
        let mut recognizer = match asr_engine
            .read()
            .expect("获取 ASR 锁失败")
            .create_recognizer()
        {
            Ok(r) => {
                let _ = ready_tx.send(true);
                r
            }
            Err(e) => {
                warn!("Tier1 识别器创建失败，跳过段落识别: {}", e);
                let _ = ready_tx.send(false);
                return;
            }
        };

        while let Ok(task) = rx.recv() {
            recognizer.accept_waveform(&task.audio_samples);
            let final_result = recognizer.finalize();
            recognizer.reset();

            if final_result.text.is_empty() {
                continue;
            }

            let segment = TranscriptSegment {
                id: task.segment_id.clone(),
                start_time: task.start_time,
                end_time: task.end_time,
                text: final_result.text.clone(),
                is_final: true,
                confidence: Some(final_result.confidence),
                source: Some(task.source),
                language: None,
                words: None,
                created_at: Utc::now().to_rfc3339(),
                tier: Some("tier1".to_string()),
            };

            event_bus.publish(AppEvent::TranscriptFinal(TranscriptFinalPayload {
                session_id: task.session_id.clone(),
                segment,
            }));

            if let Some(ref refiner) = delayed_refiner {
                if let Ok(mut map) = segment_sources.lock() {
                    map.insert(task.segment_id.clone(), task.source);
                }
                let refiner = refiner.clone();
                let session_id = task.session_id.clone();
                let segment_id = task.segment_id.clone();
                let audio_samples = task.audio_samples;
                let tier1_text = final_result.text.clone();

                tauri::async_runtime::spawn(async move {
                    refiner
                        .schedule(session_id, segment_id, audio_samples, tier1_text)
                        .await;
                });
            }
        }
    });

    match ready_rx.recv_timeout(Duration::from_secs(2)) {
        Ok(true) => Some(tx),
        Ok(false) | Err(_) => None,
    }
}
