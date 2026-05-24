// 主窗口 — 录音库 + 详情区(M3 T15 / T16 / T35 等填实)
// T10 阶段只保持 T01 已有的 placeholder renderer 能起来。

import path from 'node:path'
import { BrowserWindow } from 'electron'

let instance: BrowserWindow | null = null

export function createMainWindow(): BrowserWindow {
  if (instance && !instance.isDestroyed()) {
    instance.show()
    instance.focus()
    return instance
  }

  const win = new BrowserWindow({
    width: 1080,
    height: 720,
    show: false,
    title: 'LazyAudio',
    // §5.7 集成式 chrome:macOS fullSizeContentView + traffic light @ 16/18
    // Windows titleBarOverlay 留 T70 release 阶段(与 template icon 一起)
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      // preload 强制 CJS 输出(.js),sandbox: true 下 Electron 不支持 ESM preload
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
    void win.loadURL(`${devUrl}/main.html`)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/main.html'))
  }

  instance = win
  return win
}

export function getMainWindow(): BrowserWindow | null {
  return instance && !instance.isDestroyed() ? instance : null
}

export function showMainWindow(): void {
  const win = getMainWindow() ?? createMainWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}
