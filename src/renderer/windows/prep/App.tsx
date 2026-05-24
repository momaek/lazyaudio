// T11 — 录音前浮窗 UI
// 视觉对齐 information-architecture.md §4.2 ASCII mockup,frameless 浮窗 520×360 由 T10 prep-window.ts 创建。
//
// 行为:
// - mount 时 invoke record.getPrepDefaults() → 设 sessionType + sources 初值
// - Enter / "开始录音" → invoke record.start() → 成功后 invoke record.hidePrep()
// - Esc / "取消" → invoke record.hidePrep()
// - 标题(title)在 renderer 本地拼:`{sessionType 中文} {YYYY-MM-DD HH:mm}`,提交时算
//   一次,避免 main → user 之间过期(ipc-contract.md §2.1 注明)

import '../../styles/globals.css'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/Button'
import type { SessionType } from '@shared/ipc/record'

// 与 TypeBadge.tsx + common.json session.* 对齐
const SESSION_I18N_KEY: Record<SessionType, string> = {
  general: 'session.general',
  meeting: 'session.meeting',
  note: 'session.note',
  'interview-as-interviewer': 'session.interviewAsInterviewer',
  'interview-as-candidate': 'session.interviewAsCandidate',
  lecture: 'session.lecture',
  podcast: 'session.podcast',
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

export function App(): React.JSX.Element {
  const { t } = useTranslation()
  const [sessionType, setSessionType] = useState<SessionType>('general')
  const [mic, setMic] = useState(true)
  const [system, setSystem] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

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

  const handleCancel = useCallback(async () => {
    try {
      await window.lazyaudio.record.hidePrep()
    } catch (e) {
      console.warn('hidePrep failed', e)
    }
  }, [])

  const handleStart = useCallback(async () => {
    if (submitting) return
    if (!mic && !system) {
      setErrorMsg(t('prep.errorNoSource'))
      return
    }
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
      // 保留 submitting=true 直到下次 show:浮窗 hide 后被 blur,下次 show 时组件已被
      // hide / show 复用(不 remount),所以重置 submitting 由下面的 visibilitychange 兜底
    } catch (e) {
      setErrorMsg(t('prep.errorStartFailed') + ' ' + String(e))
      setSubmitting(false)
    }
  }, [submitting, mic, system, sessionType, t])

  // 浮窗下次 show 时(visibilitychange visible)重置 submitting + 清错
  useEffect(() => {
    function onVis(): void {
      if (document.visibilityState === 'visible') {
        setSubmitting(false)
        setErrorMsg(null)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // 全局键盘:Enter 提交 / Esc 取消
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        void handleCancel()
      } else if (e.key === 'Enter') {
        // focus 在 chip 按钮上时让按钮 native 处理(否则空格 / Enter 默认会激活 chip);
        // focus 在 start / cancel 按钮上 native 也会触发 onClick,不重复 dispatch。
        const target = e.target as HTMLElement | null
        if (target?.tagName === 'BUTTON') return
        e.preventDefault()
        void handleStart()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleCancel, handleStart])

  return (
    <main
      className="bg-bg-l1 text-fg flex h-screen flex-col gap-4 p-5 text-sm select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <header
        className="text-fg-strong text-base font-semibold"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {t('prep.title')}
      </header>

      <section
        className="flex flex-col gap-2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <label className="text-fg-muted text-xs">{t('prep.sessionType')}</label>
        <div className="flex flex-wrap gap-1.5">
          {SESSION_ORDER.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setSessionType(type)}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                sessionType === type ? 'bg-accent text-white' : 'bg-bg-l2 text-fg hover:bg-bg-l3'
              }`}
            >
              {t(SESSION_I18N_KEY[type])}
            </button>
          ))}
        </div>
      </section>

      <section
        className="flex flex-col gap-2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <label className="text-fg-muted text-xs">{t('prep.sources')}</label>
        <div className="flex gap-4">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={mic}
              onChange={(e) => setMic(e.target.checked)}
              className="accent-accent h-4 w-4"
            />
            <span>{t('prep.mic')}</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={system}
              onChange={(e) => setSystem(e.target.checked)}
              className="accent-accent h-4 w-4"
            />
            <span>{t('prep.system')}</span>
          </label>
        </div>
      </section>

      {errorMsg && (
        <div
          className="text-danger text-xs"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {errorMsg}
        </div>
      )}

      <div className="flex-1" />

      <section
        className="flex items-center justify-between"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <span className="text-fg-muted text-xs">{t('prep.shortcutHint')}</span>
        <div className="flex gap-2">
          <Button variant="ghost" size="default" onClick={() => void handleCancel()}>
            {t('prep.cancel')}
          </Button>
          <Button
            variant="primary"
            size="default"
            onClick={() => void handleStart()}
            disabled={submitting}
            autoFocus
          >
            {submitting ? t('prep.starting') : t('prep.start')}
          </Button>
        </div>
      </section>
    </main>
  )
}
