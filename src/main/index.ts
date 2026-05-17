import './env'

import path from 'node:path'
import { app, BrowserWindow } from 'electron'
import { registerIpc } from './ipc/register'

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1080,
    height: 720,
    show: false,
    title: 'LazyAudio',
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

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(`${devUrl}/main.html`)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/main.html'))
  }

  return win
}

app.whenReady().then(() => {
  registerIpc()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
