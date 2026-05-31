// T33 — 转录文本面板(详情区)。
// T37 失败处理:failed → 错误文案 + [重试];model-missing → 提示去设置下载。
//
// 状态来源:transcribe.getTranscript(recordingId) 拉一次 + onStatusChanged 增量。

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { Transcript, TranscriptSegment } from '@shared/transcribe/transcript'
import type { TranscribeStatus } from '@shared/recording/meta'

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
  seg: TranscriptSegment
  active: boolean
  onSeekSec: (sec: number) => void
}): React.JSX.Element {
  return (
    <div className={`tr-seg${active ? ' is-active' : ''}`} data-speaker={speakerIndex(seg.speaker)}>
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
}: {
  recordingId: string
  currentSec: number
  onSeekSec: (sec: number) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [status, setStatus] = useState<TranscribeStatus>('idle')
  const [error, setError] = useState<string | undefined>(undefined)
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [progress, setProgress] = useState<{ processedSec: number; totalSec: number } | null>(null)

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
    refresh()
    const off = window.lazyaudio.transcribe.onStatusChanged((event) => {
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
    return () => off()
  }, [recordingId, refresh])

  const onRetry = useCallback(() => {
    setStatus('running')
    setError(undefined)
    void window.lazyaudio.transcribe.retry(recordingId)
  }, [recordingId])

  const activeId = useMemo(() => {
    if (!transcript) return null
    const hit = transcript.segments.find((s) => currentSec >= s.start && currentSec < s.end)
    return hit?.segmentId ?? null
  }, [transcript, currentSec])

  return (
    <div className="transcript-panel">
      <div className="tr-head">
        <h2>{t('common:transcript.title')}</h2>
        {status === 'done' && transcript ? (
          <span className="tr-count">
            {t('common:transcript.segmentCount', { count: transcript.segments.length })}
          </span>
        ) : null}
      </div>

      {status === 'idle' ? (
        <div className="tr-idle">
          <span className="tr-hint">{t('common:transcript.notTranscribed')}</span>
          <button type="button" className="btn btn-secondary" onClick={onRetry}>
            {t('common:transcript.start')}
          </button>
        </div>
      ) : null}

      {status === 'pending' ? <div className="tr-hint">{t('common:transcript.queued')}</div> : null}

      {status === 'running' ? (
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
      ) : null}

      {status === 'failed' ? (
        <div className="tr-failed">
          <div className="tr-failed-msg">
            {error === 'model-missing'
              ? t('common:transcript.errorModelMissing')
              : t('common:transcript.errorGeneric')}
          </div>
          {error && error !== 'model-missing' ? (
            <div className="tr-failed-detail">{error}</div>
          ) : null}
          <button type="button" className="btn btn-secondary" onClick={onRetry}>
            {t('common:transcript.retry')}
          </button>
        </div>
      ) : null}

      {status === 'done' && transcript ? (
        transcript.segments.length === 0 ? (
          <div className="tr-hint">{t('common:transcript.empty')}</div>
        ) : (
          <div className="tr-list">
            {transcript.segments.map((seg) => (
              <SegmentRow
                key={seg.segmentId}
                seg={seg}
                active={seg.segmentId === activeId}
                onSeekSec={onSeekSec}
              />
            ))}
          </div>
        )
      ) : null}
    </div>
  )
}
