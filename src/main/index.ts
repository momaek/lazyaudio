import './env'

import { app, BrowserWindow } from 'electron'
import { registerIpc } from './ipc/register'
import { initLogger, logger } from './logger'
import { acquireSingleInstanceLock } from './lifecycle/single-instance'
import { installBeforeQuitHandler } from './lifecycle/before-quit'
import { createMainWindow } from './windows/main-window'
import { createPrepWindow } from './windows/prep-window'
import { createTray, destroyTray } from './menu/tray'
import { installAppMenu } from './menu/app-menu'
import { registerToggleRecord, unregisterAllShortcuts } from './shortcut/register'

app.setName('LazyAudio')

if (!acquireSingleInstanceLock()) {
  app.quit()
} else {
  initLogger()
  installBeforeQuitHandler()

  app.whenReady().then(() => {
    registerIpc()
    installAppMenu()
    createMainWindow()
    createPrepWindow() // 常驻 hidden,T11 / shortcut handler 触发 .show()
    createTray()
    registerToggleRecord()

    logger.info('app ready')

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  // macOS:关闭所有窗口不退出 app(tray 仍在,符合 menubar app 行为);
  // Win / Linux:关闭主窗口即退出
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  // tray + shortcut 资源清理(macOS Cmd+Q / Win Ctrl+Q 触发)
  app.on('will-quit', () => {
    unregisterAllShortcuts()
    destroyTray()
  })
}
