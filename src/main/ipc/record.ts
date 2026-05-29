// record domain IPC handlers
//
// T11 起 prep 浮窗的 3 handler(getPrepDefaults / start / hidePrep)。
// T12 升级:start 改为真生成 recordingId + 走录音状态机 + IPC 通知 capture window
//          启 capture;加 stop handler(走状态机 + 通知 capture window 停)。
// pause / resume / tick / stateChanged 留 T13 / T17。

import { ipcMain, BrowserWindow, dialog } from 'electron'
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
import { CaptureFailedArgs } from '@shared/audio/messages'
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
import { broadcastRecorderState, getRecorderSnapshot } from '../audio/recorder-broadcast'
import { RecorderSnapshot, GetStateArgs } from '@shared/ipc/record'
import { RecordingSession } from '../recording/session'
import { setCurrentSession, getCurrentSession } from '../recording'
import { runMixdown } from '../recording/mixer'
import { purgeRecordingTracks } from '../audio/receiver'
import { getMicStatus, requestMic, isMicGranted, openMicSettings } from '../permission/mic'
import { z } from 'zod'

const StopArgs = z.object({}).optional()

// T20 — 录音前麦克风权限 gate(dialogs-notifications.md D5)。
// 返回 true = 已授权可继续;false = 未授权(已弹提示),record:start 应中止。
async function ensureMicPermission(): Promise<boolean> {
  let status = getMicStatus()
  if (status === 'not-determined') {
    status = await requestMic() // 弹系统授权框(仅 not-determined 有效)
  }
  if (isMicGranted(status)) return true

  // denied / restricted / 用户在系统框点了拒绝:弹 D5 引导去系统设置
  logger.warn('record:start blocked — mic permission not granted', { status })
  const choice = dialog.showMessageBoxSync({
    type: 'warning',
    buttons: ['稍后', '打开系统设置'],
    defaultId: 1,
    cancelId: 0,
    message: '需要麦克风权限',
    detail:
      'LazyAudio 没有麦克风权限，无法开始录音。请到「系统设置 → 隐私与安全性 → 麦克风」开启 LazyAudio。',
  })
  if (choice === 1) await openMicSettings()
  return false
}

async function failCurrentRecording(recordingId: string, reason: string): Promise<void> {
  const session = getCurrentSession()
  if (session && session.id === recordingId) {
    await session.fail(reason).catch((e) => logger.error(`session.fail failed: ${String(e)}`))
    setCurrentSession(null)
  } else if (session) {
    logger.warn(`capture failure for ${recordingId}, but current session is ${session.id}; ignored`)
    return
  }
  // 兜底:即使 renderer 在 catch 里补了 track-close,异常路径(端口断 / postMessage 抛)
  // 也可能漏发;main 端这里强清一遍 receiver 的 tracks map,避免孤儿 tick。
  purgeRecordingTracks(recordingId)
  transitionToIdle()
  broadcastRecorderState()
  logger.warn('recording failed → state machine → idle', { recordingId, reason })
}

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

    // T20:录音前麦克风权限 gate。没授权 → 弹提示 + 中止(不进录音状态机,避免"瞬间 partial")
    if (!(await ensureMicPermission())) {
      throw new Error('record:start blocked — microphone permission not granted')
    }

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

    // T13:创建 RecordingSession(mkdir + 写 initial meta);writers 等 track-open 到达时创建
    let session
    try {
      session = await RecordingSession.start({
        id: state.recordingId!,
        title: args.title,
        sessionType: args.sessionType,
        sources: args.sources,
        startedAt: state.startedAt!,
      })
      setCurrentSession(session)
    } catch (e) {
      transitionToIdle()
      broadcastRecorderState()
      throw new Error(`record:start: session.start failed: ${String(e)}`)
    }

    // 通知 capture window 启 capture(T12)
    const captureWin = getCaptureWindow()
    if (!captureWin) {
      // 极端情况:capture window 还没 ready / 已 closed → 状态回 idle 报错
      await session.stop().catch(() => {})
      setCurrentSession(null)
      transitionToIdle()
      broadcastRecorderState()
      throw new Error('capture window not available')
    }
    captureWin.webContents.send(AUDIO.startCapture, {
      recordingId: state.recordingId,
      sources: args.sources,
    })

    // 状态机已进 recording → 广播给主窗口渲染"录音中"UI
    broadcastRecorderState()

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

    // 通知 capture window 停 capture(让 worklet 发 track-close)
    const captureWin = getCaptureWindow()
    if (captureWin && recordingId) {
      captureWin.webContents.send(AUDIO.stopCapture, { recordingId })
    }

    // T13:等 track-close 路径走完(receiver 收到 track-close 调 session.closeTrack),
    // 再 stop session 写 final meta。给 capture renderer 100ms teardown 时间,然后强行 stop。
    const session = getCurrentSession()
    if (session) {
      await new Promise<void>((resolve) => setTimeout(resolve, 200))
      await session.stop().catch((e) => logger.error(`session.stop failed: ${String(e)}`))
      const finishedId = session.id
      setCurrentSession(null)
      // T14:fire-and-forget mixdown(meta.mixStatus 已在 stop 里设 'pending')。
      // 不 await — 用户停止后录音应立刻进库,混音异步在后台跑(audio-capture §6.0)。
      void runMixdown(finishedId).catch((e) =>
        logger.error(`mixdown unhandled: ${String(e)}`, { recordingId: finishedId }),
      )
    }

    transitionToIdle()
    broadcastRecorderState()
    logger.info('record:stop → state machine → idle', { recordingId })

    return { ok: true }
  })

  ipcMain.handle(CHANNEL.getState, async (_event, rawArgs: unknown) => {
    GetStateArgs.parse(rawArgs)
    const snapshot = getRecorderSnapshot()
    assertSchemaDev(RecorderSnapshot, snapshot)
    return snapshot
  })

  ipcMain.on(AUDIO.captureFailed, (event, rawArgs: unknown) => {
    const args = CaptureFailedArgs.parse(rawArgs)
    logger.error('audio:capture-failed', { recordingId: args.recordingId, message: args.message })
    void failCurrentRecording(args.recordingId, `capture failed: ${args.message}`)
    void event
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
