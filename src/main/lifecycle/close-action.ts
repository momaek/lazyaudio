// T17 — 关主窗口的动作判定(纯函数,无 electron 依赖,便于单测)。
//
// 录音中(recording / stopping)绝不退出 → 强制最小化到菜单栏(AC「录音中按 ⌘W 不停」);
// 非录音时按 T18「关闭主窗口时」设置:quit → 退出 app,minimize → 最小化到菜单栏。

import type { RecorderStatus } from '../audio/recorder-state'
import type { CloseMainWindowBehavior } from '@shared/ipc/settings'

export type CloseAction = 'minimize' | 'quit'

export function decideCloseAction(
  status: RecorderStatus,
  behavior: CloseMainWindowBehavior,
): CloseAction {
  if (status === 'recording' || status === 'stopping') return 'minimize'
  return behavior === 'quit' ? 'quit' : 'minimize'
}
