// 主窗口 — T04 端到端 IPC sanity + T05 i18n 接入。
// 后续 M3 起这个文件会被 T15(库列表)+ T16(详情区)等替换。
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import '../../styles/globals.css'
import type { PingResult } from '@shared/ipc/system'
import { Button } from '../../components/Button'
import { formatDateTime } from '../../i18n/format'

type Status =
  | { kind: 'loading' }
  | { kind: 'ok'; result: PingResult }
  | { kind: 'error'; message: string }

export function App(): React.JSX.Element {
  const { t } = useTranslation()
  const [status, setStatus] = useState<Status>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    // 防御 preload 缺失(browser 直接访问 / preload 注入失败):不让 useEffect 同步 throw 把整棵树拆掉。
    const api = (window as Window & { lazyaudio?: typeof window.lazyaudio }).lazyaudio
    if (!api?.system?.ping) {
      setStatus({
        kind: 'error',
        message: 'window.lazyaudio.system.ping unavailable (preload missing)',
      })
      return
    }
    api.system
      .ping()
      .then((result) => {
        if (!cancelled) setStatus({ kind: 'ok', result })
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg-l1 text-gray-900 dark:text-gray-50">
      <h1 className="text-2xl font-semibold">{t('common:appName')}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">{t('common:ping.subtitle')}</p>

      <section
        data-testid="ping-status"
        className="min-w-80 rounded-lg border border-border bg-bg-l2 p-4 text-sm"
      >
        {status.kind === 'loading' && <p>{t('common:ping.loading')}</p>}

        {status.kind === 'ok' && (
          <div className="space-y-1 font-mono">
            <p>
              <span className="text-gray-500">{t('common:ping.fieldTsMs')}:</span>{' '}
              {status.result.tsMs}
            </p>
            <p>
              <span className="text-gray-500">{t('common:ping.fieldTime')}:</span>{' '}
              {formatDateTime(status.result.tsMs)}
            </p>
            <p>
              <span className="text-gray-500">{t('common:ping.fieldNode')}:</span>{' '}
              {status.result.nodeVersion}
            </p>
            <p>
              <span className="text-gray-500">{t('common:ping.fieldElectron')}:</span>{' '}
              {status.result.electronVersion}
            </p>
          </div>
        )}

        {status.kind === 'error' && (
          <p className="text-danger">{t('errors:pingFailed', { message: status.message })}</p>
        )}
      </section>

      {/* 占位 Button — 真正的"开始录音"流程在 T10/T11 接;这里只验 t('common.start') 端到端 */}
      <Button variant="primary" disabled>
        {t('common:start')}
      </Button>
    </main>
  )
}
