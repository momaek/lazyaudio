// 设置窗口 — 按需打开,关闭即销毁(不像 prep 那样常驻 hidden)
//
// T10 阶段仅起骨架,内部 5 个 tab 在 T18 / T38 / T52 / T57 等逐步填实。

import path from 'node:path'
import { BrowserWindow } from 'electron'

let instance: BrowserWindow | null = null

export function openSettingsWindow(): BrowserWindow {
  if (instance && !instance.isDestroyed()) {
    instance.show()
    instance.focus()
    return instance
  }

  const win = new BrowserWindow({
    width: 880,
    height: 640,
    show: false,
    title: 'LazyAudio 设置',
    minWidth: 720, // design-brief §6.x:"最小 720×520"
    minHeight: 520,
    fullscreenable: false, // design-brief §6.x:"不可全屏"
    // §5.7 集成式 chrome:macOS fullSizeContentView + traffic light @ 16/18
    // Windows titleBarOverlay 留 T70 release 阶段
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  win.once('ready-to-show', () => win.show())

  win.on('closed', () => {
    instance = null
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(`${devUrl}/settings.html`)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/settings.html'))
  }

  instance = win
  return win
}

export function getSettingsWindow(): BrowserWindow | null {
  return instance && !instance.isDestroyed() ? instance : null
}
