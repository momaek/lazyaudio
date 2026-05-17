import path from 'node:path'
import { app } from 'electron'
import log from 'electron-log/main'

type LogLevel = 'error' | 'warn' | 'info' | 'verbose' | 'debug' | 'silly'

let initialized = false

export function initLogger(): void {
  if (initialized) return
  initialized = true

  log.transports.console.format = '[{level}] {text}'
  log.transports.console.level = app.isPackaged ? 'info' : 'debug'

  if (app.isPackaged) {
    log.transports.file.resolvePathFn = () => path.join(app.getPath('logs'), 'main.log')
    log.transports.file.maxSize = 2 * 1024 * 1024
    log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
    log.transports.file.level = 'info'
  } else {
    log.transports.file.level = false
  }
}

// utility 进程通过 MessagePort 把日志回灌主进程,统一落盘(overview §6.5)。
// utility 入口要 M3+ 才起来,这里先暴露 attach helper,等 utility 创建后调用。
export function attachUtilityLogTransport(port: Electron.MessagePortMain): void {
  port.on('message', (event) => {
    const msg = event.data as { level?: LogLevel; data?: unknown[] } | undefined
    if (!msg || typeof msg.level !== 'string') return
    const fn = log[msg.level]
    if (typeof fn === 'function') {
      fn('[utility]', ...(msg.data ?? []))
    }
  })
  port.start()
}

export { log as logger }
