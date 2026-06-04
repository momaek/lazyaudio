// system domain IPC handlers。
// 当前只有 ping(T04 端到端 sanity);permission / notify / reveal 等通道随后续 T 接入。
import { ipcMain, shell } from 'electron'
import {
  CHANNEL,
  PingArgs,
  PingResult,
  OpenExternalArgs,
  OpenExternalResult,
} from '@shared/ipc/system'
import { assertSchemaDev } from '../util/assert-schema'

export function register(): void {
  // T57 — 关于页外链:用默认浏览器打开(仅 http/https)
  ipcMain.handle(CHANNEL.openExternal, async (_event, rawArgs: unknown) => {
    const { url } = OpenExternalArgs.parse(rawArgs)
    let result: OpenExternalResult
    try {
      if (!/^https?:\/\//i.test(url)) result = { ok: false, error: 'unsupported-protocol' }
      else {
        await shell.openExternal(url)
        result = { ok: true }
      }
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
    assertSchemaDev(OpenExternalResult, result)
    return result
  })

  ipcMain.handle(CHANNEL.ping, async (_event, rawArgs: unknown) => {
    // 不可信输入:prod 也跑 parse
    PingArgs.parse(rawArgs)

    const result = {
      tsMs: Date.now(),
      nodeVersion: process.versions.node,
      electronVersion: process.versions.electron ?? 'unknown',
    } as const

    // 自家出去的:dev assert 兜底
    assertSchemaDev(PingResult, result)
    return result
  })
}
