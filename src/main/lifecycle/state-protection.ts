// T17 — 状态保护:录音中不被意外中断 + 退出前确认。
//
// 1. 录音中关主窗口 → 仅最小化到菜单栏(不停录);非录音按 T18「关闭主窗口时」设置走
// 2. 录音中退出 app → 弹确认 dialog;确认后 flush 当前录音再放行
// 3. capture renderer 崩溃 → failActiveRecording(在 index.ts 接 render-process-gone)
//
// decideCloseAction 抽成纯函数,便于单测(AC「录音中按 ⌘W 不停」的判定逻辑)。

import { app, dialog } from 'electron'
import { getStatus } from '../audio/recorder-state'
import { getSettings } from '../settings/settings-store'
import { registerBeforeQuitHook } from './before-quit'
import { failActiveRecording } from '../recording/abort'
import { decideCloseAction } from './close-action'
import { logger } from '../logger'

// app 真正在退出(Cmd+Q / 确认退出后)时置 true,让主窗口 close handler 放行不再拦。
let quitting = false
export function isQuitting(): boolean {
  return quitting
}
export function markQuitting(): void {
  quitting = true
}

function isRecording(): boolean {
  const s = getStatus()
  return s === 'recording' || s === 'stopping'
}

/** 主窗口 close 事件处理:返回 true 表示已拦截(window 不该关)。 */
export function handleMainWindowClose(win: Electron.BrowserWindow, event: Electron.Event): void {
  if (quitting) return // 真退出,放行
  const action = decideCloseAction(getStatus(), getSettings().general.closeMainWindowBehavior)
  if (action === 'quit') {
    markQuitting()
    app.quit()
    return
  }
  // minimize:不关窗,隐藏到菜单栏(录音中也走这条 → 不停录)
  event.preventDefault()
  win.hide()
  logger.info('main window close → hidden to menubar', { recording: isRecording() })
}

/** 注册「录音中退出确认」before-quit hook。 */
export function installStateProtection(): void {
  registerBeforeQuitHook(async (event) => {
    if (quitting) return
    // 非录音:这是一次真正的退出请求(tray「退出」/ ⌘Q / app menu Quit),
    // 标 quitting 让主窗口 close handler 放行,否则「关闭主窗口时=最小化」会把退出当成关窗拦下来。
    if (!isRecording()) {
      markQuitting()
      return
    }
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      buttons: ['取消', '停止录音并退出'],
      defaultId: 0,
      cancelId: 0,
      message: '正在录音',
      detail: '退出 LazyAudio 会停止当前录音。确定要退出吗？',
    })
    if (choice === 0) {
      event.preventDefault()
      logger.info('quit cancelled — recording in progress')
      return
    }
    // 确认退出:先 flush 当前录音(标 failed-partial,已落盘部分保留),再放行
    markQuitting()
    await failActiveRecording('app quit during recording')
  })
}
