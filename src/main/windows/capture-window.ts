// T12 — 常驻 hidden capture window
//
// 设计意图(audio-capture §3 + spike-005):
// - audio capture 必须跑在常驻 renderer(prep 关闭后 capture 必须继续)
// - main window 是 UI 不该混 capture;新开一个 hidden chrome-less window 专跑 capture
// - 窗口对用户不可见,永不 show;skipTaskbar + 1×1 尺寸
//
// 关键(spike-005):
// - 不要传 useSystemPicker: true(否则 setDisplayMediaRequestHandler 被 TCC 短路)
// - macOS 26 + unsigned Electron:Electron.app 必须 ad-hoc 签 + tccutil reset

import path from 'node:path'
import { BrowserWindow } from 'electron'
import { logger } from '../logger'

let instance: BrowserWindow | null = null

export function createCaptureWindow(): BrowserWindow {
  if (instance && !instance.isDestroyed()) return instance

  const win = new BrowserWindow({
    width: 1,
    height: 1,
    x: 0,
    y: 0,
    show: false, // 永不显示
    title: 'LazyAudio Audio Capture',
    frame: false,
    skipTaskbar: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false, // 不抢焦点
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true, // 与其他窗口一致;preload 仅 forward audio-port,不需要 Node APIs
      webSecurity: true,
      backgroundThrottling: false, // hidden window 默认 throttle;capture 必须实时
    },
  })

  win.on('closed', () => {
    instance = null
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(`${devUrl}/capture.html`)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/capture.html'))
  }

  instance = win
  logger.info('capture window created (hidden, never visible)')
  return win
}

export function getCaptureWindow(): BrowserWindow | null {
  return instance && !instance.isDestroyed() ? instance : null
}
