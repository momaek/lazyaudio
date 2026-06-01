// Onboarding 窗口 — 首启一次性 wizard。
// T50:窗口固定 880×640,步骤状态走 settings.onboarding 持久化。

import path from 'node:path'
import { BrowserWindow } from 'electron'
import { ONBOARDING } from '@shared/ipc/channels'
import { getPlatformSupport } from '../onboarding/platform'

let instance: BrowserWindow | null = null

export function createOnboardingWindow(): BrowserWindow {
  if (instance && !instance.isDestroyed()) {
    instance.show()
    instance.focus()
    return instance
  }

  const platform = getPlatformSupport()
  const win = new BrowserWindow({
    width: 880,
    height: 640,
    show: false,
    title: 'LazyAudio 设置向导',
    resizable: false,
    maximizable: false,
    fullscreenable: false,
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

  // 屏 0 是 dead-end,关闭等同退出;其它步骤由 renderer beforeunload confirm。
  win.on('close', (event) => {
    if (!platform.ok) return
    if (!win.webContents.isDestroyed()) {
      event.preventDefault()
      win.webContents.send(ONBOARDING.requestClose)
    }
  })

  win.once('ready-to-show', () => win.show())

  win.on('closed', () => {
    instance = null
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(`${devUrl}/onboarding.html`)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/onboarding.html'))
  }

  instance = win
  return win
}

export function getOnboardingWindow(): BrowserWindow | null {
  return instance && !instance.isDestroyed() ? instance : null
}

export function closeOnboardingWindow(): void {
  const win = getOnboardingWindow()
  if (!win) return
  win.removeAllListeners('close')
  win.close()
}
