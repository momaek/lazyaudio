import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LibraryEntry, LibraryGroup } from '@shared/ipc/library'
import { mediaUrl } from '@shared/ipc/channels'
import type { SessionType, RecorderSnapshot, Sources } from '@shared/ipc/record'
import '../../styles/globals.css'
import './main.css'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; groups: LibraryGroup[]; total: number }
  | { kind: 'error'; message: string }

const SESSION_I18N_KEY: Record<SessionType, string> = {
  general: 'session.general',
  meeting: 'session.meeting',
  note: 'session.note',
  'interview-as-interviewer': 'session.interviewAsInterviewer',
  'interview-as-candidate': 'session.interviewAsCandidate',
  lecture: 'session.lecture',
  podcast: 'session.podcast',
}

const SESSION_UI_TYPE: Record<SessionType, string> = {
  general: 'general',
  meeting: 'meeting',
  note: 'note',
  'interview-as-interviewer': 'interviewer',
  'interview-as-candidate': 'candidate',
  lecture: 'lecture',
  podcast: 'podcast',
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function formatTimeOfDay(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 与 prep 浮窗一致:`{类型} YYYY-MM-DD HH:mm`(录音标题不在 snapshot 里,按 startedAt 复原)
function formatTitleTimestamp(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function sourcePreview(entry: LibraryEntry): string {
  if (entry.status === 'recording') return '录制中'
  if (entry.status === 'failed-partial') return '录音中断，已保存部分音频'
  if (entry.mixStatus === 'running' || entry.mixStatus === 'pending') return '正在生成 mixed.wav'
  if (entry.mixStatus === 'failed') return '混音失败，分轨仍可用'
  return '等待转录'
}

function SearchIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="m10.2 10.2 2.3 2.3M6.4 11a4.6 4.6 0 1 1 0-9.2 4.6 4.6 0 0 1 0 9.2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

// 空状态详情区(§6.2)的文档图标(取自 ui-mockups/.../icons.jsx glyph.note)
function NoteIcon(): React.JSX.Element {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 1.5h4.5L9.5 3.5V10a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V2a.5.5 0 0 1 .5-.5z" />
      <path d="M4.5 5h3M4.5 7h3" />
    </svg>
  )
}

function ListItem({
  entry,
  selected,
  onSelect,
}: {
  entry: LibraryEntry
  selected: boolean
  onSelect: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`lib-item ${selected ? 'is-selected' : ''}`}
      data-type={SESSION_UI_TYPE[entry.sessionType]}
      onClick={onSelect}
    >
      <span className="lib-item-dot" />
      <div className="lib-item-title">
        <b>{entry.title}</b>
        <span className="timeofday">{formatTimeOfDay(entry.startedAt)}</span>
      </div>
      <div className="lib-item-dur">{formatDuration(entry.durationMs)}</div>
      <div className="lib-item-preview">{sourcePreview(entry)}</div>
    </button>
  )
}

function LibrarySidebar({
  groups,
  selectedId,
  onSelect,
  recording,
}: {
  groups: LibraryGroup[]
  selectedId: string | null
  onSelect: (entry: LibraryEntry) => void
  recording: RecordingInfo | null
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <aside className="lib">
      <div className="lib-window-drag-region" aria-hidden="true" />
      <button type="button" className="lib-tool-btn" title={t('common:settings')}>
        {t('common:library.settingsIcon')}
      </button>
      <div className="lib-search-row">
        <div className="search-input">
          <SearchIcon />
          <input placeholder={t('common:library.searchPlaceholder')} readOnly />
          <span className="search-kbd">{t('common:library.searchShortcut')}</span>
        </div>
      </div>
      <div className="chip-row">
        <button type="button" className="chip is-active">
          {t('common:library.all')}
        </button>
      </div>

      {groups.length === 0 && !recording ? (
        <div className="lib-list-empty">
          <div>{t('common:library.emptyTitle')}</div>
          <div>{t('common:library.emptyHint')}</div>
        </div>
      ) : (
        <div className="lib-list">
          {recording && <RecordingListItem info={recording} />}
          {groups.map((group) => (
            <div key={group.label}>
              <div className="lib-group-head">{group.label}</div>
              {group.entries.map((entry) => (
                <ListItem
                  key={entry.id}
                  entry={entry}
                  selected={entry.id === selectedId}
                  onSelect={() => onSelect(entry)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}

function DetailPlaceholder({ entry }: { entry: LibraryEntry | null }): React.JSX.Element {
  const { t } = useTranslation()
  if (!entry) {
    return (
      <section className="detail">
        <div className="empty-stage">
          <div className="icon-circle">
            <NoteIcon />
          </div>
          <h2>{t('common:library.detailEmptyTitle')}</h2>
          <div className="sub">
            <span>{t('common:library.emptyStartPrefix')}</span>
            <span className="kbd">{t('common:library.emptyKbdCmd')}</span>
            <span className="kbd">{t('common:library.emptyKbdShift')}</span>
            <span className="kbd">{t('common:library.emptyKbdR')}</span>
            <span>{t('common:library.emptyStartSuffix')}</span>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 8 }}
            onClick={() => {
              window.lazyaudio.record
                .showPrep()
                .catch((e) => console.warn('record.showPrep failed', e))
            }}
          >
            {t('common:library.startRecording')}
          </button>
          <div className="empty-tips">
            <div className="row">
              <span className="dot" />
              {t('common:library.emptyTipCapture')}
            </div>
            <div className="row">
              <span className="dot" />
              {t('common:library.emptyTipLocal')}
            </div>
            <div className="row">
              <span className="dot" />
              {t('common:library.emptyTipShortcut')}
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="detail">
      <header className="dh">
        <span className="dh-title">{entry.title}</span>
        <span className="type-badge" data-type={SESSION_UI_TYPE[entry.sessionType]}>
          {t(`common:${SESSION_I18N_KEY[entry.sessionType]}`)}
        </span>
        <span className="dh-meta">
          <span>{formatDuration(entry.durationMs)}</span>
          <span className="dot-sep" />
          <span>{sourcePreview(entry)}</span>
        </span>
      </header>
      <Player entry={entry} />
      <div className="detail-stage">
        <h2>{t('common:library.detailTitle')}</h2>
        <p>{t('common:library.detailHint')}</p>
      </div>
    </section>
  )
}

type RecordingInfo = {
  sessionType: SessionType
  sources: Sources
  startedAt: number
  elapsedMs: number
}

// ---- 录音中详情面板用到的图标(取自 ui-mockups/.../icons.jsx,1.5 stroke / 12-16 viewBox) ----
function PlayIcon(): React.JSX.Element {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
      <path d="M3 1.5v9l8-4.5L3 1.5z" />
    </svg>
  )
}
function PauseIcon(): React.JSX.Element {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
      <rect x="3" y="2" width="2.2" height="8" rx="0.5" />
      <rect x="6.8" y="2" width="2.2" height="8" rx="0.5" />
    </svg>
  )
}
function StopIcon(): React.JSX.Element {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
      <rect x="2.5" y="2.5" width="7" height="7" rx="1" />
    </svg>
  )
}
function SkipBackIcon(): React.JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M11 4.5 5 8l6 3.5V4.5z" />
      <path d="M5 4v8" />
    </svg>
  )
}
function SkipForwardIcon(): React.JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 4.5 11 8l-6 3.5V4.5z" />
      <path d="M11 4v8" />
    </svg>
  )
}
function ChevronDownIcon(): React.JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m3 4.5 3 3 3-3" />
    </svg>
  )
}
function TemplateIcon(): React.JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="2" width="8" height="8" rx="1" />
      <path d="M2 4.8h8M5 4.8v5.2" />
    </svg>
  )
}
function CopyIcon(): React.JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="5" y="5" width="8.5" height="9" rx="1.5" />
      <path d="M10.5 5V3.5A1 1 0 0 0 9.5 2.5h-6A1 1 0 0 0 2.5 3.5v7A1 1 0 0 0 3.5 11.5H5" />
    </svg>
  )
}

function sessionLabelText(t: (k: string) => string, type: SessionType): string {
  return t(`common:${SESSION_I18N_KEY[type]}`)
}

function sourcesText(t: (k: string) => string, sources: Sources): string {
  const parts: string[] = []
  if (sources.mic) parts.push(t('common:library.sourceMic'))
  if (sources.system) parts.push(t('common:library.sourceSystem'))
  return parts.join(' + ')
}

// 录音中波形(装饰性,非真实 PCM 振幅)。确定性伪随机,与 mockup LiveWaveform 一致。
function LiveWaveform(): React.JSX.Element {
  const bars = 220
  const height = 48
  const arr = useMemo(() => {
    const out: number[] = []
    let seed = 4421
    for (let i = 0; i < bars; i++) {
      seed = (seed * 9301 + 49297) % 233280
      const r = seed / 233280
      const recency = i / bars
      const env = 0.3 + 0.6 * recency
      const local = 0.3 + 0.8 * Math.pow(r, 1.3)
      const pocket = i % 53 < 3 ? 0.3 : 1
      out.push(Math.max(0.08, env * local * pocket))
    }
    return out
  }, [])
  return (
    <svg
      className="wf-canvas"
      viewBox={`0 0 ${bars * 4} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {arr.map((v, i) => {
        const h = Math.max(1, v * (height - 4))
        const y = (height - h) / 2
        const isHead = i > bars - 8
        return (
          <rect
            key={i}
            x={i * 4 + 1}
            y={y}
            width={2}
            height={h}
            rx={1}
            fill="var(--color-record)"
            opacity={isHead ? 0.95 : 0.6}
          />
        )
      })}
    </svg>
  )
}

// T16 — 可播放的波形条:装饰 bars(非真实 PCM 峰值)+ 已播段染 accent + playhead + 点击/拖动 seek。
function PlaybackWaveform({
  progress,
  onSeek,
  disabled,
}: {
  progress: number
  onSeek: (fraction: number) => void
  disabled: boolean
}): React.JSX.Element {
  const bars = 200
  const height = 48
  const arr = useMemo(() => {
    const out: number[] = []
    let seed = 1337
    for (let i = 0; i < bars; i++) {
      seed = (seed * 9301 + 49297) % 233280
      const r = seed / 233280
      out.push(Math.max(0.12, Math.pow(r, 1.2)))
    }
    return out
  }, [])
  const ref = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const seekAt = useCallback(
    (clientX: number) => {
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      // 减去左右各 16px padding,映射到 canvas 实际宽度
      const inner = rect.width - 32
      if (inner <= 0) return
      const frac = (clientX - rect.left - 16) / inner
      onSeek(Math.max(0, Math.min(1, frac)))
    },
    [onSeek],
  )

  return (
    <div
      className={`wf wf-playable${disabled ? ' is-disabled' : ''}`}
      ref={ref}
      onPointerDown={(e) => {
        if (disabled) return
        dragging.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        seekAt(e.clientX)
      }}
      onPointerMove={(e) => {
        if (dragging.current) seekAt(e.clientX)
      }}
      onPointerUp={(e) => {
        dragging.current = false
        try {
          e.currentTarget.releasePointerCapture(e.pointerId)
        } catch {
          /* pointer 已释放 */
        }
      }}
    >
      <svg
        className="wf-canvas"
        viewBox={`0 0 ${bars * 4} ${height}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        {arr.map((v, i) => {
          const h = Math.max(1, v * (height - 4))
          const y = (height - h) / 2
          const played = i / bars <= progress
          return (
            <rect
              key={i}
              x={i * 4 + 1}
              y={y}
              width={2}
              height={h}
              rx={1}
              fill={played ? 'var(--color-accent)' : 'var(--color-gray-300)'}
            />
          )
        })}
      </svg>
      <div
        className="wf-playhead"
        style={{ left: `calc(16px + (100% - 32px) * ${Math.max(0, Math.min(1, progress))})` }}
      />
    </div>
  )
}

// T16 — 详情区播放器(选中已完成录音时显示)。
// 范围(用户拍板):play/pause + 波形 seek + ±15s 跳转 功能化;倍速按钮渲染但静态占位(归后续);
// 波形为装饰(非真实 PCM 峰值)。音频经 main 的 lazyaudio-media:// 协议流式提供(支持 Range)。
function Player({ entry }: { entry: LibraryEntry }): React.JSX.Element {
  const { t } = useTranslation()
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentMs, setCurrentMs] = useState(0)
  const [durationMs, setDurationMs] = useState(entry.durationMs)
  const [unavailable, setUnavailable] = useState(false)
  const src = mediaUrl(entry.id)

  // 切到另一条录音:重置播放态(<audio> src 变了)
  useEffect(() => {
    setPlaying(false)
    setCurrentMs(0)
    setDurationMs(entry.durationMs)
    setUnavailable(false)
  }, [entry.id, entry.durationMs])

  const effectiveDurationSec = useCallback((): number => {
    const el = audioRef.current
    if (el && Number.isFinite(el.duration) && el.duration > 0) return el.duration
    return durationMs / 1000
  }, [durationMs])

  const togglePlay = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) el.play().catch(() => setUnavailable(true))
    else el.pause()
  }, [])

  const skip = useCallback(
    (deltaSec: number) => {
      const el = audioRef.current
      if (!el) return
      const dur = effectiveDurationSec()
      el.currentTime = Math.max(0, Math.min(dur, el.currentTime + deltaSec))
    },
    [effectiveDurationSec],
  )

  const seekToFraction = useCallback(
    (fraction: number) => {
      const el = audioRef.current
      if (!el) return
      const dur = effectiveDurationSec()
      if (dur > 0) el.currentTime = Math.max(0, Math.min(dur, fraction * dur))
    },
    [effectiveDurationSec],
  )

  const progress = durationMs > 0 ? Math.min(1, currentMs / durationMs) : 0

  return (
    <>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration
          if (Number.isFinite(d) && d > 0) setDurationMs(d * 1000)
        }}
        onTimeUpdate={(e) => setCurrentMs(e.currentTarget.currentTime * 1000)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setUnavailable(true)}
      />
      <PlaybackWaveform progress={progress} onSeek={seekToFraction} disabled={unavailable} />
      <div className={`pc${unavailable ? ' is-disabled' : ''}`}>
        <button
          type="button"
          className="pc-play"
          onClick={togglePlay}
          disabled={unavailable}
          title={playing ? t('common:pause') : t('common:library.play')}
          aria-label={playing ? t('common:pause') : t('common:library.play')}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div className="pc-time">
          <span className="now">{formatDuration(currentMs)}</span>
          <span className="sep">{t('common:library.playerTimeSep')}</span>
          <span className="total">{formatDuration(durationMs)}</span>
        </div>
        <div className="pc-right">
          <button
            type="button"
            className="pc-btn"
            onClick={() => skip(-15)}
            disabled={unavailable}
            title={t('common:library.playerSkipBack')}
          >
            <SkipBackIcon />
            <span>{t('common:library.playerSkip')}</span>
          </button>
          <button
            type="button"
            className="pc-btn"
            disabled
            title={t('common:library.playerSpeedSoon')}
          >
            <span>{t('common:library.playerSpeed')}</span>
            <ChevronDownIcon />
          </button>
          <button
            type="button"
            className="pc-btn"
            onClick={() => skip(15)}
            disabled={unavailable}
            title={t('common:library.playerSkipForward')}
          >
            <span>{t('common:library.playerSkip')}</span>
            <SkipForwardIcon />
          </button>
        </div>
      </div>
      {unavailable ? <div className="pc-error">{t('common:library.playerUnavailable')}</div> : null}
    </>
  )
}

// 录音中详情面板(screen-specs §状态3 §3 / mockup §6.3.5)。
// 偏离备注:暂停按钮目前无功能(pause 状态机属 T17);波形为装饰、转录/摘要为占位(与 mockup 一致)。
function DetailRecording({
  info,
  onStop,
}: {
  info: RecordingInfo
  onStop: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const sessionLabel = sessionLabelText(t, info.sessionType)
  const title = `${sessionLabel} ${formatTitleTimestamp(info.startedAt)}`
  const templateLabel = t('common:library.summaryTemplate', { type: sessionLabel })
  return (
    <section className="detail">
      <header className="dh">
        <span className="dh-title">{title}</span>
        <span className="type-badge" data-type={SESSION_UI_TYPE[info.sessionType]}>
          {sessionLabel}
        </span>
        <span className="dh-meta">
          <span className="dh-rec-time">
            <span className="record-dot" />
            <span className="dh-rec-clock">{formatDuration(info.elapsedMs)}</span>
          </span>
          <span className="dot-sep" />
          <span>{sourcesText(t, info.sources)}</span>
        </span>
        <div className="dh-actions">
          <button
            type="button"
            className="btn-rec-pause"
            disabled
            title={t('common:library.pauseSoon')}
          >
            <PauseIcon />
            {t('common:pause')}
          </button>
          <button type="button" className="btn-rec-stop" onClick={onStop}>
            <StopIcon />
            {t('common:library.recordingStop')}
          </button>
        </div>
      </header>

      <div className="wf">
        <LiveWaveform />
      </div>

      <div className="pc is-disabled">
        <button type="button" className="pc-play" aria-hidden>
          <PlayIcon />
        </button>
        <div className="pc-time">
          <span className="now">{t('common:library.playerNoTime')}</span>
          <span className="sep">{t('common:library.playerTimeSep')}</span>
          <span className="total">{formatDuration(info.elapsedMs)}</span>
        </div>
        <div className="pc-right">
          <button type="button" className="pc-btn">
            <SkipBackIcon />
            <span>{t('common:library.playerSkip')}</span>
          </button>
          <button type="button" className="pc-btn">
            <span>{t('common:library.playerSpeed')}</span>
            <ChevronDownIcon />
          </button>
          <button type="button" className="pc-btn">
            <span>{t('common:library.playerSkip')}</span>
            <SkipForwardIcon />
          </button>
        </div>
      </div>

      <div className="tx-summary">
        <div className="tx">
          <div className="tx-head">
            {t('common:library.transcript')}
            <div className="tx-head-right">{t('common:library.transcriptAutoStart')}</div>
          </div>
          <div className="tx-placeholder">
            <div className="skeleton-stack">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div className="sk-row" key={i}>
                  <div className="sk-bar" style={{ width: 32, height: 8 }} />
                  <div className="sk-bar" style={{ width: 14, height: 8, borderRadius: '50%' }} />
                  <div className="sk-bar" style={{ width: `${60 + ((i * 7) % 36)}%` }} />
                </div>
              ))}
            </div>
            <div className="hint">{t('common:library.transcriptPlaceholder')}</div>
          </div>
        </div>

        <div className="tx-divider" />

        <div className="sm is-disabled">
          <div className="sm-head">
            {t('common:library.summary')}
            <span className="template">
              <TemplateIcon />
              {templateLabel}
            </span>
          </div>
          <div className="sm-placeholder">
            <div className="icon-box">
              <TemplateIcon />
            </div>
            <div className="hint hint-strong">{t('common:library.summaryAfterStop')}</div>
            <div className="hint">
              {t('common:library.summaryTemplateHint', { type: sessionLabel })}
            </div>
          </div>
          <div className="sm-actions">
            <button type="button" className="btn btn-secondary btn-compact">
              <TemplateIcon />
              {t('common:library.changeTemplate')}
            </button>
            <button type="button" className="btn btn-secondary btn-compact">
              <CopyIcon />
              {t('common:library.copy')}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

// 列表顶部置顶的"录音中"项(screen-specs §状态3 §2);不可被选中。
function RecordingListItem({ info }: { info: RecordingInfo }): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="lib-item is-recording" data-type={SESSION_UI_TYPE[info.sessionType]}>
      <span className="lib-item-dot" />
      <div className="lib-item-title">
        <b>{sessionLabelText(t, info.sessionType)}</b>
        <span className="rec-tag">{t('common:library.recordingTag')}</span>
      </div>
      <div className="lib-item-dur">{formatDuration(info.elapsedMs)}</div>
      <div className="lib-item-preview">
        {t('common:library.recordingPreview', { sources: sourcesText(t, info.sources) })}
      </div>
    </div>
  )
}

export function App(): React.JSX.Element {
  const { t } = useTranslation()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [recState, setRecState] = useState<RecorderSnapshot | null>(null)
  const [nowTs, setNowTs] = useState<number>(() => Date.now())
  const recStatusRef = useRef<RecorderSnapshot['status'] | null>(null)

  useEffect(() => {
    let cancelled = false
    window.lazyaudio.library
      .list()
      .then((result) => {
        if (cancelled) return
        setState({ kind: 'ready', groups: result.groups, total: result.total })
        setSelectedId(result.groups[0]?.entries[0]?.id ?? null)
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 录音停止后刷新列表(不改当前选中),让刚录完的那条进库
  const refetchLibrary = useCallback(() => {
    window.lazyaudio.library
      .list()
      .then((result) => setState({ kind: 'ready', groups: result.groups, total: result.total }))
      .catch(() => {
        /* 刷新失败不打断 UI;下次手动重开窗口会重试 */
      })
  }, [])

  // 拉一次当前录音状态 + 订阅状态变更;recording → 非 recording 时刷新列表
  useEffect(() => {
    let cancelled = false
    window.lazyaudio.record
      .getState()
      .then((snap) => {
        if (cancelled) return
        recStatusRef.current = snap.status
        setRecState(snap)
      })
      .catch(() => {
        /* 拿不到状态就当 idle */
      })
    const off = window.lazyaudio.record.onStateChanged((snap) => {
      const wasRecording = recStatusRef.current === 'recording'
      recStatusRef.current = snap.status
      setRecState(snap)
      if (wasRecording && snap.status !== 'recording') refetchLibrary()
    })
    return () => {
      cancelled = true
      off()
    }
  }, [refetchLibrary])

  // 录音中本地 1s 计时(时长从 startedAt 推,不依赖 main 端 tick)
  useEffect(() => {
    if (recState?.status !== 'recording') return
    setNowTs(Date.now())
    const id = setInterval(() => setNowTs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [recState?.status])

  const recordingInfo = useMemo<RecordingInfo | null>(() => {
    if (
      recState?.status !== 'recording' ||
      !recState.sessionType ||
      !recState.sources ||
      recState.startedAt == null
    ) {
      return null
    }
    return {
      sessionType: recState.sessionType,
      sources: recState.sources,
      startedAt: recState.startedAt,
      elapsedMs: Math.max(0, nowTs - recState.startedAt),
    }
  }, [recState, nowTs])

  const handleStop = useCallback(() => {
    window.lazyaudio.record.stop().catch((e) => console.warn('record.stop failed', e))
  }, [])

  const selectedEntry = useMemo(() => {
    if (state.kind !== 'ready' || !selectedId) return null
    for (const group of state.groups) {
      const entry = group.entries.find((item) => item.id === selectedId)
      if (entry) return entry
    }
    return null
  }, [selectedId, state])

  if (state.kind === 'loading') {
    return <main className="main-loading">{t('common:library.loading')}</main>
  }

  if (state.kind === 'error') {
    return (
      <main className="main-loading is-error">
        {t('errors:libraryListFailed', { message: state.message })}
      </main>
    )
  }

  return (
    <main className="main-window">
      <div className="mw-body">
        <LibrarySidebar
          groups={state.groups}
          selectedId={selectedId}
          onSelect={(entry) => setSelectedId(entry.id)}
          recording={recordingInfo}
        />
        {recordingInfo ? (
          <DetailRecording info={recordingInfo} onStop={handleStop} />
        ) : (
          <DetailPlaceholder entry={selectedEntry} />
        )}
      </div>
    </main>
  )
}
