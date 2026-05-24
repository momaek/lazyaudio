// 全局快捷键 handler
//
// T10 阶段:⌘⇧R 永远 = 显示 prep 浮窗。
// T11 / T12 接录音状态机后,handler 要根据当前状态分叉:
//   - 空闲    → showPrepWindow()
//   - 录音中  → 直接 stopAndSave()(双向语义,见 user-flows.md §2.2)
//   - 暂停中  → 直接 stopAndSave()
//   - 浮窗中  → 等同 Enter,立即开始录音
// 现在留 TODO 注释,待 T12 接入。

import { logger } from '../logger'
import { showPrepWindow } from '../windows/prep-window'

export function handleToggleRecord(): void {
  // TODO(T12): 接录音状态机后按当前状态分叉,见 user-flows.md §2.2 快捷键双向语义
  logger.info('shortcut: toggle-record (idle → show prep window)')
  showPrepWindow()
}
