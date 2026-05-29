import './env'

import { app, BrowserWindow, session, desktopCapturer } from 'electron'
import { registerIpc } from './ipc/register'
import { initLogger, logger } from './logger'
import { acquireSingleInstanceLock } from './lifecycle/single-instance'
import { installBeforeQuitHandler } from './lifecycle/before-quit'
import { installStateProtection } from './lifecycle/state-protection'
import { failActiveRecording } from './recording/abort'
import { createMainWindow } from './windows/main-window'
import { createPrepWindow } from './windows/prep-window'
import { createCaptureWindow } from './windows/capture-window'
import { createTray, destroyTray } from './menu/tray'
import { installAppMenu } from './menu/app-menu'
import { unregisterAllShortcuts } from './shortcut/register'
import { setupAudioPort, teardownAudioPort } from './audio/port'
import { startAudioReceiver } from './audio/receiver'
import { maybeRunAutotest } from './audio/autotest'
import { registerMediaScheme, registerMediaProtocol } from './media/protocol'
import { loadSettings } from './settings/settings-store'
import { applySettingsEffects } from './settings/apply'

app.setName('LazyAudio')

// scheme 须在 app ready 前注册为 privileged(T16 录音音频流式协议)
registerMediaScheme()

if (!acquireSingleInstanceLock()) {
  app.quit()
} else {
  initLogger()
  installBeforeQuitHandler()

  app.whenReady().then(async () => {
    registerIpc()
    registerMediaProtocol()
    await loadSettings() // T18:启动读 settings.json(dev 在 .local-userdata/)
    installAppMenu()

    // T12 — system audio loopback via ScreenCaptureKit audio-only path(spike-005 验过)
    // 关键:不要传 useSystemPicker: true(会让 Chromium 在 handler 之前做 TCC 检查并按
    // screen=denied 短路);返 audio: 'loopback' 不带 video → 走 macOS 14.4+ audio-only
    // SCKit,对应 "System Audio Recording Only" 权限组,不要 Screen Recording 全权限。
    session.defaultSession.setDisplayMediaRequestHandler((_req, callback) => {
      callback({ audio: 'loopback' })
    })

    createMainWindow()
    createPrepWindow() // 常驻 hidden,shortcut handler / tray 触发 .show()
    const captureWin = createCaptureWindow() // 常驻 hidden,跑 audio capture

    // capture window load 完后建 MessageChannelMain + 推 port2 给它
    captureWin.webContents.once('did-finish-load', () => {
      setupAudioPort(captureWin.webContents)
    })
    // receiver 监听 port 上的 PCM 消息(track-open / chunk / track-close)
    startAudioReceiver()

    createTray()
    applySettingsEffects() // T18:开机自启 + 全局快捷键(用持久化的 accel)
    installStateProtection() // T17:录音中退出确认 hook(关主窗口最小化在 main-window close handler)

    // 兜底:开发期看到 capture window load 阶段的错(spike-005 踩坑)
    captureWin.webContents.on('did-fail-load', (_e, code, desc) => {
      logger.error('capture window failed to load', { code, desc })
    })
    // T17:capture renderer 崩溃 → flush 当前录音 + 标 failed-partial(已落盘部分可播)
    captureWin.webContents.on('render-process-gone', (_e, details) => {
      logger.error('capture window render-process-gone', { reason: details.reason })
      void failActiveRecording(`capture renderer gone: ${details.reason}`)
    })
    // 防御:macOS Tahoe + 未签 Electron 时 screen 权限可能直接 denied,这里仅 log
    if (process.platform === 'darwin') {
      // 利用 desktopCapturer 让 Electron 触发权限检查(虽然 audio-only 路径理论
      // 不依赖 screen capture 权限,但保留诊断 log 帮排查)
      void desktopCapturer
        .getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
        .then((srcs) => logger.info(`[diag] desktopCapturer.getSources ok, ${srcs.length} sources`))
        .catch((e) => logger.warn(`[diag] desktopCapturer.getSources failed: ${e.message}`))
    }

    logger.info('app ready')
    maybeRunAutotest() // LAZY_AUTOTEST=1 时启 5s/10s/2s 自动验证 capture pipeline

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  // macOS:关闭所有窗口不退出 app(tray 仍在,符合 menubar app 行为);
  // Win / Linux:关闭主窗口即退出
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  // tray + shortcut + audio port 资源清理(macOS Cmd+Q / Win Ctrl+Q 触发)
  app.on('will-quit', () => {
    unregisterAllShortcuts()
    destroyTray()
    teardownAudioPort()
  })
}
