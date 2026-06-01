import './env'

import { app, BrowserWindow } from 'electron'
import { registerIpc } from './ipc/register'
import { initLogger, logger } from './logger'
import { acquireSingleInstanceLock } from './lifecycle/single-instance'
import { installBeforeQuitHandler } from './lifecycle/before-quit'
import { destroyTray } from './menu/tray'
import { unregisterAllShortcuts } from './shortcut/register'
import { teardownAudioPort } from './audio/port'
import { maybeRunAutotest } from './audio/autotest'
import { maybeRunSmoke, maybeRunAsrSmoke } from './smoke'
import { registerMediaScheme, registerMediaProtocol } from './media/protocol'
import { loadSettings } from './settings/settings-store'
import { createOnboardingWindow } from './windows/onboarding-window'
import { bootstrapMainAppWindows, shouldShowOnboarding } from './ipc/onboarding'
import { getPlatformSupport } from './onboarding/platform'

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

    const platform = getPlatformSupport()
    if (!platform.ok) {
      createOnboardingWindow()
      logger.info('app ready: onboarding version gate', { detected: platform.detected })
      maybeRunSmoke()
      return
    }

    if (shouldShowOnboarding()) {
      createOnboardingWindow()
      logger.info('app ready: onboarding')
      maybeRunSmoke()
      return
    }

    bootstrapMainAppWindows()

    logger.info('app ready')
    maybeRunAutotest() // LAZY_AUTOTEST=1 时启 5s/10s/2s 自动验证 capture pipeline
    maybeRunSmoke() // LAZY_SMOKE=1 时(CI build-mac job)验启动不崩 → 3s 后自动退出
    maybeRunAsrSmoke() // T30 — LAZY_ASR_SMOKE=1 时 fork asr utility 验 require('sherpa-onnx-node')

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) bootstrapMainAppWindows()
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
