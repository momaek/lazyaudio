// T33/T34/T35 — 转录文本面板(详情区)。
// - 离线(Pass B):transcribe.getTranscript 拉一次 + onStatusChanged 增量。
// - 实时(Pass A,T34/T35):onLiveSegment 增量并段,hypothesis 灰斜体、confirmed 正常,
//   按 segmentId 原地替换不跳行(spike-013);Pass B 完成(onOfflineOverwrite)→ 整体换 transcript.json。
// - T37 失败:failed → 文案 + [重试](no-audio/model-missing 特判)。

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { Transcript } from '@shared/transcribe/transcript'
import type { TranscribeStatus } from '@shared/recording/meta'
import type { LiveSegmentPayload } from '@shared/ipc/transcribe'

interface DisplaySegment {
  segmentId: string
  start: number
  end: number
  text: string
  speaker: string
  stability: 'hypothesis' | 'confirmed'
}

function formatSec(sec: number): string {
  const total = Math.max(0, Math.floor(sec))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// data-model §4.1:mic→speaker-1 / system→speaker-2 / mixed→speaker-3
function speakerIndex(speaker: string): number {
  if (speaker === 'mic') return 1
  if (speaker === 'system') return 2
  if (speaker === 'mixed') return 3
  return 5
}

function SegmentRow({
  seg,
  active,
  onSeekSec,
}: {
  seg: DisplaySegment
  active: boolean
  onSeekSec: (sec: number) => void
}): React.JSX.Element {
  const cls = [
    'tr-seg',
    active ? 'is-active' : '',
    seg.stability === 'hypothesis' ? 'is-hypothesis' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={cls} data-speaker={speakerIndex(seg.speaker)}>
      <button
        type="button"
        className="tr-ts"
        onClick={() => onSeekSec(seg.start)}
        title={formatSec(seg.start)}
      >
        {formatSec(seg.start)}
      </button>
      <div className="tr-text">{seg.text}</div>
    </div>
  )
}

export function TranscriptPanel({
  recordingId,
  currentSec,
  onSeekSec,
  isRecording = false,
}: {
  recordingId: string
  currentSec: number
  onSeekSec: (sec: number) => void
  /** 这条录音是否正在录制(决定空态文案 + 是否展示「开始转录」按钮) */
  isRecording?: boolean
}): React.JSX.Element {
  const { t } = useTranslation()
  const [status, setStatus] = useState<TranscribeStatus>('idle')
  const [error, setError] = useState<string | undefined>(undefined)
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [progress, setProgress] = useState<{ processedSec: number; totalSec: number } | null>(null)
  // Pass A 实时段(in-memory,按 segmentId)
  const [liveSegs, setLiveSegs] = useState<Record<string, LiveSegmentPayload>>({})

  const refresh = useCallback(() => {
    window.lazyaudio.transcribe
      .getTranscript(recordingId)
      .then((r) => {
        setStatus(r.status)
        setError(r.error)
        setTranscript(r.transcript)
      })
      .catch(() => {
        /* 拿不到保持当前态 */
      })
  }, [recordingId])

  useEffect(() => {
    setProgress(null)
    setLiveSegs({})
    refresh()
    const offStatus = window.lazyaudio.transcribe.onStatusChanged((event) => {
      if (event.recordingId !== recordingId) return
      setStatus(event.status)
      setError(event.error)
      if (event.status === 'running' && event.totalSec != null && event.processedSec != null) {
        setProgress({ processedSec: event.processedSec, totalSec: event.totalSec })
      }
      if (event.status === 'done') {
        setProgress(null)
        refresh()
      }
      if (event.status === 'failed') setProgress(null)
    })
    const offLive = window.lazyaudio.transcribe.onLiveSegment((event) => {
      if (event.recordingId !== recordingId) return
      setLiveSegs((prev) => ({ ...prev, [event.segment.segmentId]: event.segment }))
    })
    const offOverwrite = window.lazyaudio.transcribe.onOfflineOverwrite((event) => {
      if (event.recordingId !== recordingId) return
      setLiveSegs({}) // Pass B 覆盖 → 清实时段,整体换 transcript.json
      refresh()
    })
    return () => {
      offStatus()
      offLive()
      offOverwrite()
    }
  }, [recordingId, refresh])

  const onRetry = useCallback(() => {
    setStatus('running')
    setError(undefined)
    void window.lazyaudio.transcribe.retry(recordingId)
  }, [recordingId])

  // 合并:transcript 文件段 + 实时内存段(按 id 覆盖),按 start 排序
  const segments = useMemo<DisplaySegment[]>(() => {
    const byId = new Map<string, DisplaySegment>()
    if (transcript) {
      for (const s of transcript.segments) {
        byId.set(s.segmentId, {
          segmentId: s.segmentId,
          start: s.start,
          end: s.end,
          text: s.text,
          speaker: s.speaker,
          stability: s.stability,
        })
      }
    }
    for (const s of Object.values(liveSegs)) byId.set(s.segmentId, s)
    return [...byId.values()].sort((a, b) => a.start - b.start)
  }, [transcript, liveSegs])

  const activeId = useMemo(() => {
    const hit = segments.find((s) => currentSec >= s.start && currentSec < s.end)
    return hit?.segmentId ?? null
  }, [segments, currentSec])

  const isRefined = status === 'done' && transcript?.pass === 'offline'

  return (
    <div className="transcript-panel">
      <div className="tr-head">
        <h2>{t('common:transcript.title')}</h2>
        {isRefined ? <span className="tr-refined">{t('common:transcript.refined')}</span> : null}
        {segments.length > 0 ? (
          <span className="tr-count">
            {t('common:transcript.segmentCount', { count: segments.length })}
          </span>
        ) : null}
      </div>

      {/* 有段就渲染(实时 / 离线);否则按状态显示占位 */}
      {segments.length > 0 ? (
        <div className="tr-list">
          {segments.map((seg) => (
            <SegmentRow
              key={seg.segmentId}
              seg={seg}
              active={seg.segmentId === activeId}
              onSeekSec={onSeekSec}
            />
          ))}
        </div>
      ) : isRecording ? (
        <div className="tr-hint">{t('common:transcript.listening')}</div>
      ) : status === 'idle' ? (
        <div className="tr-idle">
          <span className="tr-hint">{t('common:transcript.notTranscribed')}</span>
          <button type="button" className="btn btn-secondary" onClick={onRetry}>
            {t('common:transcript.start')}
          </button>
        </div>
      ) : status === 'pending' ? (
        <div className="tr-hint">{t('common:transcript.queued')}</div>
      ) : status === 'running' ? (
        <div className="tr-running">
          <div className="tr-spinner" />
          <span>
            {progress && progress.totalSec > 0
              ? t('common:transcript.runningPct', {
                  pct: Math.min(100, Math.round((progress.processedSec / progress.totalSec) * 100)),
                })
              : t('common:transcript.running')}
          </span>
        </div>
      ) : status === 'failed' ? (
        <div className="tr-failed">
          <div className="tr-failed-msg">
            {error === 'model-missing'
              ? t('common:transcript.errorModelMissing')
              : error === 'no-audio'
                ? t('common:transcript.errorNoAudio')
                : t('common:transcript.errorGeneric')}
          </div>
          {error && error !== 'model-missing' && error !== 'no-audio' ? (
            <div className="tr-failed-detail">{error}</div>
          ) : null}
          {error !== 'no-audio' ? (
            <button type="button" className="btn btn-secondary" onClick={onRetry}>
              {t('common:transcript.retry')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
