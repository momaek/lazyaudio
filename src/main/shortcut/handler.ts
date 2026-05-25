// 全局快捷键 handler
//
// T12 起按 user-flows.md §2.2 双向语义分叉:
//   - 空闲(idle)    → showPrepWindow()
//   - 录音中(recording / preparing) → 直接 stop(走录音状态机 + session 落 final meta)
//   - 停止中(stopping)  → no-op(已经在停了,避免重复触发)
//
// T13 起 stop 路径要等 session.stop 完成(写 final meta + close wav writers),
// 与 ipc/record.ts 的 record:stop handler 行为完全对齐 — 复用同一段。

import { logger } from '../logger'
import { showPrepWindow, hidePrepWindow } from '../windows/prep-window'
import { getCaptureWindow } from '../windows/capture-window'
import { AUDIO } from '@shared/ipc/channels'
import { getStatus, getRecorderState, transitionToIdle } from '../audio/recorder-state'
import { getCurrentSession, setCurrentSession } from '../recording'

async function stopRecordingFlow(recordingId: string | null): Promise<void> {
  const captureWin = getCaptureWindow()
  if (captureWin && recordingId) {
    captureWin.webContents.send(AUDIO.stopCapture, { recordingId })
  }
  const session = getCurrentSession()
  if (session) {
    await new Promise<void>((resolve) => setTimeout(resolve, 200))
    await session.stop().catch((e) => logger.error(`[shortcut] session.stop failed: ${String(e)}`))
    setCurrentSession(null)
  }
  transitionToIdle()
}

export function handleToggleRecord(): void {
  const status = getStatus()

  if (status === 'idle') {
    logger.info('shortcut: idle → show prep window')
    showPrepWindow()
    return
  }

  if (status === 'recording' || status === 'preparing') {
    const state = getRecorderState()
    logger.info('shortcut: recording → stop', { recordingId: state.recordingId })
    // 防御:可能 prep 浮窗在录音中又被打开,这里顺手 hide
    hidePrepWindow()
    // 复用 record:stop 完整流程(stopCapture IPC → 等 session.stop → 状态 idle)
    void stopRecordingFlow(state.recordingId)
    return
  }

  // stopping:no-op
  logger.info(`shortcut: status=${status}, ignored`)
}
