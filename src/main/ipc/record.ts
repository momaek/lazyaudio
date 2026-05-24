// record domain IPC handlers
//
// T11 阶段实装 3 handler:
// - record:get-prep-defaults → 返回 hardcoded 默认(general + mic + system 全开);
//   T18 settings store 完成后改读 settings.recording.{lastSessionType, lastSourcesPerType}
// - record:start → T11 仅 log + 返回 fake { recordingId, startedAt };真实创建录音目录 /
//   开 writers / 启动 orchestrator 留 T13
// - record:hide-prep → 调 hidePrepWindow();取消按钮 / Esc 走这条
//
// pause / resume / stop / tick / stateChanged 留 T13 / T17

import { ipcMain } from 'electron'
import {
  CHANNEL,
  PrepDefaultsArgs,
  PrepDefaults,
  StartArgs,
  StartResult,
  HidePrepArgs,
  HidePrepResult,
} from '@shared/ipc/record'
import { assertSchemaDev } from '../util/assert-schema'
import { logger } from '../logger'
import { hidePrepWindow } from '../windows/prep-window'

export function register(): void {
  ipcMain.handle(CHANNEL.getPrepDefaults, async (_event, rawArgs: unknown) => {
    PrepDefaultsArgs.parse(rawArgs)
    const result = {
      defaults: {
        sessionType: 'general' as const,
        sources: { mic: true, system: true },
      },
    }
    assertSchemaDev(PrepDefaults, result)
    return result
  })

  ipcMain.handle(CHANNEL.start, async (_event, rawArgs: unknown) => {
    const args = StartArgs.parse(rawArgs)
    // T11 stub:仅 log + 返回 fake id。T13 实施时这里调 orchestrator.start() 走真实路径。
    const recordingId = `stub-${Date.now()}`
    const startedAt = Date.now()
    logger.info('[T11 stub] record:start received', {
      recordingId,
      sessionType: args.sessionType,
      sources: args.sources,
      title: args.title,
    })
    // T11 阶段:prep 浮窗收到 start 成功后由 renderer 自己 invoke hidePrep 关浮窗;
    // 不在 main 里强制 hide,避免和 renderer 的 UX 顺序(disable 按钮 / 短暂 loading)耦合死。
    const result = { recordingId, startedAt }
    assertSchemaDev(StartResult, result)
    return result
  })

  ipcMain.handle(CHANNEL.hidePrep, async (_event, rawArgs: unknown) => {
    HidePrepArgs.parse(rawArgs)
    hidePrepWindow()
    const result = { ok: true }
    assertSchemaDev(HidePrepResult, result)
    return result
  })
}
