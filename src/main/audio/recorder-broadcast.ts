// 把录音状态机的当前快照广播给所有 renderer 窗口(主窗口订阅后渲染"录音中"UI)。
//
// recorder-state.ts 故意不依赖 electron(纯状态),所以广播逻辑放这里;
// record.ts 的 IPC handler 在每次状态转换后调 broadcastRecorderState()。

import { BrowserWindow } from 'electron'
import { RECORD } from '@shared/ipc/channels'
import type { RecorderSnapshot } from '@shared/ipc/record'
import { getRecorderState } from './recorder-state'

export function getRecorderSnapshot(): RecorderSnapshot {
  const s = getRecorderState()
  return {
    status: s.status,
    recordingId: s.recordingId,
    sessionType: s.sessionType,
    sources: s.sources,
    startedAt: s.startedAt,
  }
}

export function broadcastRecorderState(): void {
  const snapshot = getRecorderSnapshot()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(RECORD.stateChanged, snapshot)
    }
  }
}
