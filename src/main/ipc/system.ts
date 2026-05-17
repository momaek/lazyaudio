// system domain IPC handlers。
// 当前只有 ping(T04 端到端 sanity);permission / notify / reveal 等通道随后续 T 接入。
import { ipcMain } from 'electron'
import { CHANNEL, PingArgs, PingResult } from '@shared/ipc/system'
import { assertSchemaDev } from '../util/assert-schema'

export function register(): void {
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
