// 主窗口 — T04 端到端 IPC sanity:挂载时调 system:ping,显示主进程返回的 timestamp + 版本。
// 后续 M3 起这个文件会被 T15(库列表)+ T16(详情区)等替换。
import { useEffect, useState } from 'react'
import '../../styles/globals.css'
import type { PingResult } from '@shared/ipc/system'

type Status =
  | { kind: 'loading' }
  | { kind: 'ok'; result: PingResult }
  | { kind: 'error'; message: string }

export function App(): React.JSX.Element {
  const [status, setStatus] = useState<Status>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    window.lazyaudio.system
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
      <h1 className="text-2xl font-semibold">LazyAudio</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">main window · T04 IPC sanity</p>

      <section
        data-testid="ping-status"
        className="min-w-80 rounded-lg border border-border bg-bg-l2 p-4 text-sm"
      >
        {status.kind === 'loading' && <p>调用 system:ping …</p>}

        {status.kind === 'ok' && (
          <div className="space-y-1 font-mono">
            <p>
              <span className="text-gray-500">tsMs:</span> {status.result.tsMs}
            </p>
            <p>
              <span className="text-gray-500">主进程时间:</span>{' '}
              {new Date(status.result.tsMs).toISOString()}
            </p>
            <p>
              <span className="text-gray-500">node:</span> {status.result.nodeVersion}
            </p>
            <p>
              <span className="text-gray-500">electron:</span> {status.result.electronVersion}
            </p>
          </div>
        )}

        {status.kind === 'error' && <p className="text-danger">ping 失败:{status.message}</p>}
      </section>
    </main>
  )
}
