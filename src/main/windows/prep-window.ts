// 录音前浮窗 — 全局快捷键 / tray dropdown 触发
//
// 关键约束(spike-010 验证):快捷键 → 浮窗 .show() < 100ms,所以浮窗**常驻 hidden**,
// 不是按需 new。app launch 时就 ready-to-show,后续只 show/hide 切换。
//
// T10 阶段仅起浮窗骨架,内部 UI(会话类型 / 音源 / 开始按钮)在 T11 实施。

import path from 'node:path'
import { BrowserWindow } from 'electron'
import { logger } from '../logger'

let instance: BrowserWindow | null = null

/**
 * 在 app.whenReady 后调用,创建常驻 hidden 浮窗。后续 showPrepWindow() 仅 .show()。
 */
export function createPrepWindow(): BrowserWindow {
  if (instance && !instance.isDestroyed()) return instance

  const win = new BrowserWindow({
    width: 520,
    height: 360,
    show: false, // 常驻 hidden
    title: 'LazyAudio 录音前',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true, // 不在 dock / taskbar 占位
    alwaysOnTop: true,
    frame: false, // 无系统 chrome,visual 由 renderer 自绘(02-design 决定)
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  // 失焦自动隐藏(用户点别处即取消;Esc 取消由 renderer 自己 ipc 触发,见 T11)
  win.on('blur', () => {
    if (win.isVisible()) win.hide()
  })

  win.on('closed', () => {
    instance = null
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(`${devUrl}/prep.html`)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/prep.html'))
  }

  instance = win
  logger.info('prep window created (hidden)')
  return win
}

export function showPrepWindow(): void {
  const win = instance && !instance.isDestroyed() ? instance : createPrepWindow()
  // 复读机模式:已可见就保持
  if (win.isVisible()) {
    win.focus()
    return
  }
  win.show()
  win.focus()
}

export function hidePrepWindow(): void {
  if (instance && !instance.isDestroyed() && instance.isVisible()) {
    instance.hide()
  }
}
