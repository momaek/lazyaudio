// record domain IPC handlers
//
// T11 起 prep 浮窗的 3 handler(getPrepDefaults / start / hidePrep)。
// T12 升级:start 改为真生成 recordingId + 走录音状态机 + IPC 通知 capture window
//          启 capture;加 stop handler(走状态机 + 通知 capture window 停)。
// pause / resume / tick / stateChanged 留 T13 / T17。

import { ipcMain, BrowserWindow } from 'electron'
import {
  CHANNEL,
  PrepDefaultsArgs,
  PrepDefaults,
  StartArgs,
  StartResult,
  HidePrepArgs,
  HidePrepResult,
} from '@shared/ipc/record'
import { AUDIO } from '@shared/ipc/channels'
import { assertSchemaDev } from '../util/assert-schema'
import { logger } from '../logger'
import { hidePrepWindow } from '../windows/prep-window'
import { getCaptureWindow } from '../windows/capture-window'
import {
  getStatus,
  transitionToRecording,
  transitionToIdle,
  getRecorderState,
} from '../audio/recorder-state'
import { z } from 'zod'

const StopArgs = z.object({}).optional()

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

    if (getStatus() !== 'idle') {
      throw new Error(`record:start ignored — current status = ${getStatus()}`)
    }

    const state = transitionToRecording({
      sessionType: args.sessionType,
      sources: args.sources,
    })

    logger.info('record:start → state machine → recording', {
      recordingId: state.recordingId,
      sessionType: args.sessionType,
      sources: args.sources,
      title: args.title,
    })

    // 通知 capture window 启 capture(T12)
    const captureWin = getCaptureWindow()
    if (!captureWin) {
      // 极端情况:capture window 还没 ready / 已 closed → 状态回 idle 报错
      transitionToIdle()
      throw new Error('capture window not available')
    }
    captureWin.webContents.send(AUDIO.startCapture, {
      recordingId: state.recordingId,
      sources: args.sources,
    })

    const result = { recordingId: state.recordingId!, startedAt: state.startedAt! }
    assertSchemaDev(StartResult, result)
    return result
  })

  ipcMain.handle(CHANNEL.stop, async (_event, rawArgs: unknown) => {
    StopArgs.parse(rawArgs)

    const before = getRecorderState()
    if (before.status === 'idle') {
      logger.info('record:stop ignored — already idle')
      return { ok: true }
    }
    const recordingId = before.recordingId

    // 通知 capture window 停 capture
    const captureWin = getCaptureWindow()
    if (captureWin && recordingId) {
      captureWin.webContents.send(AUDIO.stopCapture, { recordingId })
    }

    transitionToIdle()
    logger.info('record:stop → state machine → idle', { recordingId })

    return { ok: true }
  })

  ipcMain.handle(CHANNEL.hidePrep, async (_event, rawArgs: unknown) => {
    HidePrepArgs.parse(rawArgs)
    hidePrepWindow()
    const result = { ok: true }
    assertSchemaDev(HidePrepResult, result)
    return result
  })

  // 防止 BrowserWindow 未 import 警告
  void BrowserWindow
}
