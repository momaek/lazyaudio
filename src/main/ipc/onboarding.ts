// T50 — onboarding IPC handlers。

import { app, ipcMain, shell, session } from 'electron'
import {
  CHANNEL,
  StatusArgs,
  StatusResult,
  SetStepArgs,
  SetStepResult,
  CompleteArgs,
  CompleteResult,
  OpenSystemUpdateArgs,
  OpenSystemUpdateResult,
  QuitArgs,
  QuitResult,
} from '@shared/ipc/onboarding'
import type { OnboardingState } from '@shared/ipc/onboarding'
import {
  getSettings,
  updateOnboarding,
  updateSettings,
  type OnboardingPatch,
} from '../settings/settings-store'
import { getPlatformSupport, systemUpdateUrl } from '../onboarding/platform'
import { closeOnboardingWindow } from '../windows/onboarding-window'
import { createMainWindow, showMainWindow } from '../windows/main-window'
import { createPrepWindow, showPrepWindow } from '../windows/prep-window'
import { createCaptureWindow, getCaptureWindow } from '../windows/capture-window'
import { createTray } from '../menu/tray'
import { installAppMenu } from '../menu/app-menu'
import { setupAudioPort } from '../audio/port'
import { startAudioReceiver } from '../audio/receiver'
import { applySettingsEffects } from '../settings/apply'
import { installStateProtection } from '../lifecycle/state-protection'
import { failActiveRecording } from '../recording/abort'
import { assertSchemaDev } from '../util/assert-schema'
import { logger } from '../logger'

function currentOnboardingState(): OnboardingState {
  return getSettings().onboarding
}

let mainAppBootstrapped = false

export function shouldShowOnboarding(): boolean {
  return !getSettings().onboarding.completedAt
}

export function bootstrapMainAppWindows(): void {
  // T12 — system audio loopback。Electron 42 在 macOS 14.2+ 默认走 CoreAudio Tap。
  session.defaultSession.setDisplayMediaRequestHandler((_req, callback) => {
    callback({ audio: 'loopback' })
  })

  if (mainAppBootstrapped) {
    showMainWindow()
    return
  }

  installAppMenu()
  createMainWindow()
  createPrepWindow()
  const captureWin = getCaptureWindow() ?? createCaptureWindow()

  captureWin.webContents.once('did-finish-load', () => {
    setupAudioPort(captureWin.webContents)
  })
  startAudioReceiver()
  createTray()
  applySettingsEffects()
  installStateProtection()

  captureWin.webContents.on('render-process-gone', (_e, details) => {
    logger.error('capture window render-process-gone', { reason: details.reason })
    void failActiveRecording(`capture renderer gone: ${details.reason}`)
  })

  mainAppBootstrapped = true
  showMainWindow()
}

export function register(): void {
  ipcMain.handle(CHANNEL.status, async (_event, rawArgs: unknown) => {
    StatusArgs.parse(rawArgs)
    const onboarding = currentOnboardingState()
    const result: StatusResult = {
      done: !!onboarding.completedAt,
      onboarding,
      platform: getPlatformSupport(),
    }
    assertSchemaDev(StatusResult, result)
    return result
  })

  ipcMain.handle(CHANNEL.setStep, async (_event, rawArgs: unknown) => {
    const args = SetStepArgs.parse(rawArgs)
    const patch: OnboardingPatch = { step: args.step }
    if (args.privacyMode !== undefined) patch.privacyMode = args.privacyMode
    if (args.complianceReminderHidden !== undefined) {
      patch.complianceReminderHidden = args.complianceReminderHidden
    }
    const next = await updateOnboarding(patch)
    const result: SetStepResult = { ok: true, onboarding: next.onboarding }
    assertSchemaDev(SetStepResult, result)
    return result
  })

  ipcMain.handle(CHANNEL.complete, async (_event, rawArgs: unknown) => {
    const args = CompleteArgs.parse(rawArgs)
    if (args.cloud) {
      await updateSettings({
        cloud: {
          baseUrl: args.cloud.baseUrl,
          chatModel: args.cloud.chatModel,
          apiKey: args.cloud.apiKey,
        },
      })
    }
    const onboardingPatch: OnboardingPatch = {
      completedAt: Date.now(),
      step: 'done',
    }
    if (args.privacyMode !== undefined) onboardingPatch.privacyMode = args.privacyMode
    if (args.complianceReminderHidden !== undefined) {
      onboardingPatch.complianceReminderHidden = args.complianceReminderHidden
    }
    await updateOnboarding(onboardingPatch)

    closeOnboardingWindow()
    bootstrapMainAppWindows()
    if (args.action === 'start-recording') showPrepWindow()

    logger.info('onboarding completed', { action: args.action })
    const result: CompleteResult = { ok: true }
    assertSchemaDev(CompleteResult, result)
    return result
  })

  ipcMain.handle(CHANNEL.openSystemUpdate, async (_event, rawArgs: unknown) => {
    OpenSystemUpdateArgs.parse(rawArgs)
    const url = systemUpdateUrl(getPlatformSupport().platform)
    const ok = url
      ? await shell.openExternal(url).then(
          () => true,
          () => false,
        )
      : false
    const result: OpenSystemUpdateResult = { ok }
    assertSchemaDev(OpenSystemUpdateResult, result)
    return result
  })

  ipcMain.handle(CHANNEL.quit, async (_event, rawArgs: unknown) => {
    QuitArgs.parse(rawArgs)
    app.quit()
    const result: QuitResult = { ok: true }
    assertSchemaDev(QuitResult, result)
    return result
  })
}
