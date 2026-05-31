// T51 — LLM 摘要面板。summary.get 拉一次 + onChunk/onDone/onError 流式增量;
// react-markdown 渲染,[HH:MM:SS] linkify 成可点跳播(llm-templates.md §4)。

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Markdown from 'react-markdown'
import type { SummaryStatus } from '@shared/recording/meta'
import { templateName } from '@shared/llm/templates'

const TS_RE = /(\[\d{2}:\d{2}:\d{2}\])/g

function hmsToSec(token: string): number {
  const m = /(\d{2}):(\d{2}):(\d{2})/.exec(token)
  if (!m) return 0
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
}

/** 把 children 里的字符串按 [HH:MM:SS] 切开,匹配处渲染成可点按钮 */
function linkify(children: React.ReactNode, onSeekSec: (sec: number) => void): React.ReactNode {
  return Array.isArray(children)
    ? children.map((c, i) => <span key={i}>{linkify(c, onSeekSec)}</span>)
    : typeof children === 'string'
      ? children.split(TS_RE).map((part, i) =>
          TS_RE.test(part) ? (
            <button
              key={i}
              type="button"
              className="sum-ts"
              onClick={() => onSeekSec(hmsToSec(part))}
            >
              {part}
            </button>
          ) : (
            <span key={i}>{part}</span>
          ),
        )
      : children
}

export function SummaryPanel({
  recordingId,
  sessionType,
  onSeekSec,
}: {
  recordingId: string
  sessionType: string
  onSeekSec: (sec: number) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [status, setStatus] = useState<SummaryStatus>('idle')
  const [text, setText] = useState('')
  const [templateId, setTemplateId] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)

  const refresh = useCallback(() => {
    window.lazyaudio.summary
      .get(recordingId)
      .then((r) => {
        setStatus(r.status)
        setText(r.text ?? '')
        setTemplateId(r.templateId)
        setError(r.error)
      })
      .catch(() => {})
  }, [recordingId])

  useEffect(() => {
    setText('')
    setError(undefined)
    refresh()
    const offChunk = window.lazyaudio.summary.onChunk((e) => {
      if (e.recordingId !== recordingId) return
      setStatus('running')
      setText((prev) => prev + e.delta)
    })
    const offDone = window.lazyaudio.summary.onDone((e) => {
      if (e.recordingId !== recordingId) return
      setStatus('done')
      refresh()
    })
    const offErr = window.lazyaudio.summary.onError((e) => {
      if (e.recordingId !== recordingId) return
      setStatus('failed')
      setError(e.code === 'no-config' ? 'no-config' : e.message)
    })
    return () => {
      offChunk()
      offDone()
      offErr()
    }
  }, [recordingId, refresh])

  const onGenerate = useCallback(() => {
    setText('')
    setError(undefined)
    setStatus('running')
    void window.lazyaudio.summary.generate(recordingId)
  }, [recordingId])

  const onCancel = useCallback(() => {
    void window.lazyaudio.summary.cancel(recordingId)
  }, [recordingId])

  const tplLabel = templateName(templateId ?? sessionType)

  const mdComponents = useMemo(
    () => ({
      p: ({ children }: { children?: React.ReactNode }) => <p>{linkify(children, onSeekSec)}</p>,
      li: ({ children }: { children?: React.ReactNode }) => <li>{linkify(children, onSeekSec)}</li>,
      blockquote: ({ children }: { children?: React.ReactNode }) => (
        <blockquote>{children}</blockquote>
      ),
    }),
    [onSeekSec],
  )

  return (
    <div className="summary-panel">
      <div className="sum-head">
        <h2>{t('common:summary.title')}</h2>
        {(status === 'done' || status === 'running') && templateId ? (
          <span className="sum-template">
            {t('common:summary.usingTemplate', { name: tplLabel })}
          </span>
        ) : null}
        <div className="sum-head-actions">
          {status === 'running' ? (
            <button type="button" className="btn btn-secondary btn-compact" onClick={onCancel}>
              {t('common:summary.cancel')}
            </button>
          ) : (
            <button type="button" className="btn btn-secondary btn-compact" onClick={onGenerate}>
              {status === 'done' ? t('common:summary.regenerate') : t('common:summary.generate')}
            </button>
          )}
        </div>
      </div>

      {status === 'failed' && error === 'no-config' ? (
        <div className="sum-hint">{t('common:summary.noConfig')}</div>
      ) : status === 'failed' ? (
        <div className="sum-failed">
          <div className="sum-failed-msg">{t('common:summary.failed')}</div>
          <div className="sum-failed-detail">{error}</div>
        </div>
      ) : null}

      {status === 'idle' && !text ? (
        <div className="sum-hint">{t('common:summary.empty')}</div>
      ) : null}

      {text ? (
        <div className="sum-body">
          <Markdown components={mdComponents}>{text}</Markdown>
          {status === 'running' ? <span className="sum-caret" /> : null}
        </div>
      ) : status === 'running' ? (
        <div className="sum-running">
          <div className="tr-spinner" />
          <span>{t('common:summary.generating')}</span>
        </div>
      ) : null}
    </div>
  )
}
