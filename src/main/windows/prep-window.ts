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
    width: 360,
    // 对话框本体 220(prerecord.jsx + app.css §6.4 mockup);多出来的 200 是 popover
    // 展开时延伸到的透明区(模拟 macOS NSPopUpButton 弹出菜单超出窗口边界的行为)。
    // body / html 在 prep.css 里 override 成透明 + 顶对齐,让对话框稳定在窗口顶部。
    height: 420,
    show: false, // 常驻 hidden
    title: 'LazyAudio 录音前',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true, // 不在 dock / taskbar 占位
    alwaysOnTop: true,
    frame: false, // 无系统 chrome,visual 由 renderer 自绘(02-design)
    transparent: true, // 让 CSS backdrop-filter 透到桌面 = macOS vibrancy 效果
    hasShadow: true,
    roundedCorners: true,
    backgroundColor: '#00000000', // 完全透明;实际背景由 .prerec 的 rgba bg 提供
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
