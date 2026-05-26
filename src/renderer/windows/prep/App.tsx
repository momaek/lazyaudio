// T11 — 录音前浮窗 UI
// 严格按 02-design/ui-mockups/claude-design/project/{prerecord.jsx, app.css §6.4} 实施。
// 浮窗 360×220 macOS vibrancy(prep-window.ts 设 transparent: true 让 .prerec 的 backdrop-filter 透到桌面)。
//
// 行为:
// - mount 时 invoke record.getPrepDefaults() → 设 sessionType + sources 初值
// - Enter / "开始录音" → invoke record.start() → 成功后 invoke record.hidePrep()
// - Esc / "取消" / 右上 X / dropdown 失焦点击外部 → 关 / hide
// - title 在 renderer 本地拼:`{sessionType 中文} {YYYY-MM-DD HH:mm}`,
//   提交瞬间算一次,避免 main → user 之间过期(ipc-contract.md §2.1)

import '../../styles/globals.css'
import './prep.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SessionType } from '@shared/ipc/record'

const SESSION_I18N_KEY: Record<SessionType, string> = {
  general: 'session.general',
  meeting: 'session.meeting',
  note: 'session.note',
  'interview-as-interviewer': 'session.interviewAsInterviewer',
  'interview-as-candidate': 'session.interviewAsCandidate',
  lecture: 'session.lecture',
  podcast: 'session.podcast',
}

// 与 tokens.css --color-type-* 对齐
const SESSION_DOT_COLOR: Record<SessionType, string> = {
  general: 'var(--color-type-general)',
  meeting: 'var(--color-type-meeting)',
  note: 'var(--color-type-note)',
  'interview-as-interviewer': 'var(--color-type-interviewer)',
  'interview-as-candidate': 'var(--color-type-candidate)',
  lecture: 'var(--color-type-lecture)',
  podcast: 'var(--color-type-podcast)',
}

const SESSION_ORDER: SessionType[] = [
  'general',
  'meeting',
  'note',
  'interview-as-interviewer',
  'interview-as-candidate',
  'lecture',
  'podcast',
]

function formatTitleTimestamp(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function CheckMark(): React.JSX.Element {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m2.5 6 2.5 2.5L9.5 3.5" />
    </svg>
  )
}

function CloseX(): React.JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m2.5 2.5 7 7M9.5 2.5l-7 7" />
    </svg>
  )
}

function ChevronDown(): React.JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="type-chevron"
    >
      <path d="m3 4.5 3 3 3-3" />
    </svg>
  )
}

// 浏览器 enumerateDevices 拿到的 default 设备 label 常带 "Default - " / "默认 - " 前缀,
// 视觉上和 jsx 原型("MacBook Pro Microphone")不一致 → 这里剥掉。
function stripDefaultPrefix(label: string): string {
  return label.replace(/^(Default|默认)\s*[-—]\s*/i, '').trim()
}

async function probeDefaultMicLabel(): Promise<string> {
  if (!navigator.mediaDevices?.enumerateDevices) return ''
  try {
    const devs = await navigator.mediaDevices.enumerateDevices()
    const inputs = devs.filter((d) => d.kind === 'audioinput')
    // 优先 deviceId === 'default' 那条;否则取第一条 audioinput
    const def = inputs.find((d) => d.deviceId === 'default') ?? inputs[0]
    return def ? stripDefaultPrefix(def.label || '') : ''
  } catch {
    return ''
  }
}

export function App(): React.JSX.Element {
  const { t } = useTranslation()
  const [sessionType, setSessionType] = useState<SessionType>('general')
  const [mic, setMic] = useState(true)
  const [system, setSystem] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [micDeviceLabel, setMicDeviceLabel] = useState<string>('')
  const dropdownWrapRef = useRef<HTMLDivElement>(null)
  const submittingRef = useRef(false)

  // mount:拉默认值
  useEffect(() => {
    void (async () => {
      try {
        const res = await window.lazyaudio.record.getPrepDefaults()
        setSessionType(res.defaults.sessionType)
        setMic(res.defaults.sources.mic)
        setSystem(res.defaults.sources.system)
      } catch (e) {
        console.warn('getPrepDefaults failed', e)
      }
    })()
  }, [])

  // 设备 label 探测:mount + 每次浮窗 show + 系统设备变更时刷新一遍。
  // label 在 mic 权限未授予时是空串(Web 标准),保持空串让 UI fallback 到 i18n placeholder。
  useEffect(() => {
    let cancelled = false
    async function refresh(): Promise<void> {
      const label = await probeDefaultMicLabel()
      if (!cancelled) setMicDeviceLabel(label)
    }
    void refresh()
    const md = navigator.mediaDevices
    md?.addEventListener?.('devicechange', refresh)
    return () => {
      cancelled = true
      md?.removeEventListener?.('devicechange', refresh)
    }
  }, [])

  // 浮窗下次 show 时重置 submitting + 清错 + 关 dropdown + 重探设备名
  useEffect(() => {
    function onVis(): void {
      if (document.visibilityState === 'visible') {
        setSubmitting(false)
        submittingRef.current = false
        setErrorMsg(null)
        setDropdownOpen(false)
        void probeDefaultMicLabel().then(setMicDeviceLabel)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // dropdown 失焦点击外部关
  useEffect(() => {
    if (!dropdownOpen) return
    function onDocClick(e: MouseEvent): void {
      if (!dropdownWrapRef.current?.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [dropdownOpen])

  const handleCancel = useCallback(async () => {
    try {
      await window.lazyaudio.record.hidePrep()
    } catch (e) {
      console.warn('hidePrep failed', e)
    }
  }, [])

  const handleStart = useCallback(async () => {
    if (submittingRef.current) return
    if (!mic && !system) {
      setErrorMsg(t('prep.errorNoSource'))
      return
    }
    submittingRef.current = true
    setSubmitting(true)
    setErrorMsg(null)
    try {
      const sessionLabel = t(SESSION_I18N_KEY[sessionType])
      const title = `${sessionLabel} ${formatTitleTimestamp(Date.now())}`
      const res = await window.lazyaudio.record.start({
        sessionType,
        sources: { mic, system },
        title,
      })
      console.info('record:start ok', res)
      await window.lazyaudio.record.hidePrep()
    } catch (e) {
      setErrorMsg(t('prep.errorStartFailed') + ' ' + String(e))
      submittingRef.current = false
      setSubmitting(false)
    }
  }, [mic, system, sessionType, t])

  // 全局键盘:Esc 关 dropdown 优先,否则取消浮窗;Enter 提交
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (dropdownOpen) {
          setDropdownOpen(false)
        } else {
          void handleCancel()
        }
      } else if (e.key === 'Enter') {
        // focus 在按钮上让 native onClick 处理(避免双触发);dropdown 打开时不抢
        if (dropdownOpen) return
        const target = e.target as HTMLElement | null
        if (target?.tagName === 'BUTTON') return
        e.preventDefault()
        void handleStart()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dropdownOpen, handleCancel, handleStart])

  return (
    <div className="prerec">
      <button
        type="button"
        className="prerec-close"
        title={t('prep.close')}
        aria-label={t('prep.close')}
        onClick={() => void handleCancel()}
      >
        <CloseX />
      </button>

      <h3 className="prerec-title">{t('prep.title')}</h3>

      {/* 会话类型 dropdown */}
      <div className="prerec-row">
        <span className="lbl">{t('prep.sessionType')}</span>
        <div ref={dropdownWrapRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="type-select"
            onClick={() => setDropdownOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={dropdownOpen}
          >
            <span
              className="type-glyph-dot"
              style={{ background: SESSION_DOT_COLOR[sessionType] }}
            />
            <span>{t(SESSION_I18N_KEY[sessionType])}</span>
            <ChevronDown />
          </button>
          {dropdownOpen && (
            <div className="type-popover" role="listbox">
              {SESSION_ORDER.map((type) => (
                <button
                  key={type}
                  type="button"
                  className="type-popover-item"
                  role="option"
                  aria-selected={type === sessionType}
                  onClick={() => {
                    setSessionType(type)
                    setDropdownOpen(false)
                  }}
                >
                  <span
                    className="type-glyph-dot"
                    style={{ background: SESSION_DOT_COLOR[type] }}
                  />
                  <span>{t(SESSION_I18N_KEY[type])}</span>
                  {type === sessionType && (
                    <span className="type-popover-check">
                      <CheckMark />
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 音源 cb stack */}
      <div className="prerec-row">
        <span className="lbl">{t('prep.sources')}</span>
        <div className="checkbox-stack">
          <label className="checkbox-row">
            <input
              type="checkbox"
              className="cb-native"
              checked={mic}
              onChange={(e) => setMic(e.target.checked)}
            />
            <span className={`cb ${mic ? 'is-on' : ''}`} aria-hidden>
              {mic && <CheckMark />}
            </span>
            <span className="src-label">{t('prep.mic')}</span>
            <span className="meta" title={micDeviceLabel || t('prep.deviceMicPlaceholder')}>
              {micDeviceLabel || t('prep.deviceMicPlaceholder')}
            </span>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              className="cb-native"
              checked={system}
              onChange={(e) => setSystem(e.target.checked)}
            />
            <span className={`cb ${system ? 'is-on' : ''}`} aria-hidden>
              {system && <CheckMark />}
            </span>
            <span className="src-label">{t('prep.system')}</span>
            <span className="meta" title={t('prep.deviceSystemRoute')}>
              {t('prep.deviceSystemRoute')}
            </span>
          </label>
        </div>
      </div>

      {errorMsg && <div className="prerec-error">{errorMsg}</div>}

      <div className="prerec-actions">
        <button type="button" className="prerec-btn secondary" onClick={() => void handleCancel()}>
          {t('prep.cancel')}
        </button>
        <button
          type="button"
          className="prerec-btn primary"
          onClick={() => void handleStart()}
          disabled={submitting}
          autoFocus
        >
          {submitting ? t('prep.starting') : t('prep.start')}
        </button>
      </div>

      <div className="prerec-hint">
        <span>
          <span className="keys">{'⌘⇧R'}</span>
          {t('prep.hintStartKey')}
        </span>
        <span>
          <span className="keys">{'Esc'}</span>
          {t('prep.hintCancelKey')}
        </span>
      </div>
    </div>
  )
}
