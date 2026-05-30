import './env'

import { app, BrowserWindow, session } from 'electron'
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
import { maybeRunSmoke } from './smoke'
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

    // T12 — system audio loopback。Electron 42 在 macOS 14.2+ 默认走 CoreAudio Tap
    // (Chromium feature MacCatapLoopbackAudioForScreenShare,Electron 39+ 默认开):
    // mic + system 两路加起来只需「麦克风」权限,不触发屏幕录制权限(ADR-0001 决策路径)。
    // 关键:不要传 useSystemPicker: true(会让 Chromium 在 handler 之前做 TCC 检查并按
    // screen=denied 短路);handler 回 { audio: 'loopback' } 不带 video 即触发 audio-only
    // loopback。注:Electron < 39 会回退 ScreenCaptureKit → 误索屏幕录制权限(本项目曾因
    // 锁 Electron 35 踩此坑,故基线升到 42,与 spike-005 测试环境对齐)。
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
    logger.info('app ready')
    maybeRunAutotest() // LAZY_AUTOTEST=1 时启 5s/10s/2s 自动验证 capture pipeline
    maybeRunSmoke() // LAZY_SMOKE=1 时(CI build-mac job)验启动不崩 → 3s 后自动退出

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
