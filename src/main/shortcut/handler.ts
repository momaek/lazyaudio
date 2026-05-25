// 全局快捷键 handler
//
// T12 起按 user-flows.md §2.2 双向语义分叉:
//   - 空闲(idle)    → showPrepWindow()
//   - 录音中(recording / preparing) → 直接 stop(走录音状态机)
//   - 停止中(stopping)  → no-op(已经在停了,避免重复触发)
//
// T11 stub:无论什么状态都 show prep,留了 TODO,本 T 接。
// 后续 T13/T17 加 pause 后,recording vs paused 分叉再细化。

import { logger } from '../logger'
import { showPrepWindow, hidePrepWindow } from '../windows/prep-window'
import { getCaptureWindow } from '../windows/capture-window'
import { AUDIO } from '@shared/ipc/channels'
import { getStatus, getRecorderState, transitionToIdle } from '../audio/recorder-state'

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
    // 直接复用 record:stop 的逻辑（避免重复实现）
    const captureWin = getCaptureWindow()
    if (captureWin && state.recordingId) {
      captureWin.webContents.send(AUDIO.stopCapture, { recordingId: state.recordingId })
    }
    transitionToIdle()
    return
  }

  // stopping:no-op
  logger.info(`shortcut: status=${status}, ignored`)
}
