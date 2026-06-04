// settings domain IPC handlers(T18 起接通)。
//   - settings:get   → 返回当前完整 settings
//   - settings:set   → 部分更新 + 落盘 + 应用即时副作用 + 广播 changed
//   - settings:changed → main → 所有 renderer 的状态广播(set 后推)

import path from 'node:path'
import fs from 'node:fs/promises'
import { ipcMain, BrowserWindow, dialog, shell, app } from 'electron'
import {
  CHANNEL,
  Settings,
  GetArgs,
  SetArgs,
  PickDirResult,
  OpenDirResult,
  DangerActionArgs,
  DangerActionResult,
} from '@shared/ipc/settings'
import { getSettings, updateSettings } from '../settings/settings-store'
import { applySettingsEffects } from '../settings/apply'
import { getRecordingsDir } from '../recording/paths'
import { getModelsDir } from '../transcribe/model/paths'
import { getRecorderState } from '../audio/recorder-state'
import { getMainWindow } from '../windows/main-window'
import { assertSchemaDev } from '../util/assert-schema'
import { logger } from '../logger'

async function rmDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true })
}

function broadcastSettings(settings: Settings): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(CHANNEL.changed, settings)
  }
}

export function register(): void {
  ipcMain.handle(CHANNEL.get, async (_event, rawArgs: unknown) => {
    GetArgs.parse(rawArgs)
    const settings = getSettings()
    assertSchemaDev(Settings, settings)
    return settings
  })

  ipcMain.handle(CHANNEL.set, async (_event, rawArgs: unknown) => {
    const patch = SetArgs.parse(rawArgs)
    const next = await updateSettings(patch)
    applySettingsEffects()
    broadcastSettings(next)
    logger.info('settings:set', {
      general: patch.general ? Object.keys(patch.general) : undefined,
      shortcuts: patch.shortcuts ? Object.keys(patch.shortcuts) : undefined,
    })
    assertSchemaDev(Settings, next)
    return next
  })

  // T57 — 选录音保存目录(只返回路径,renderer 再 settings.set 持久化)
  ipcMain.handle(CHANNEL.pickRecordingsDir, async () => {
    const win = getMainWindow()
    const opts: Electron.OpenDialogOptions = {
      title: '选择录音保存目录',
      defaultPath: getRecordingsDir(),
      properties: ['openDirectory', 'createDirectory'],
    }
    const picked = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    const result: PickDirResult =
      picked.canceled || picked.filePaths.length === 0
        ? { canceled: true }
        : { canceled: false, path: picked.filePaths[0] }
    assertSchemaDev(PickDirResult, result)
    return result
  })

  // T57 — 在 Finder / 资源管理器打开录音目录
  ipcMain.handle(CHANNEL.openRecordingsDir, async () => {
    let result: OpenDirResult
    try {
      const dir = getRecordingsDir()
      await fs.mkdir(dir, { recursive: true })
      const err = await shell.openPath(dir)
      result = err ? { ok: false, error: err } : { ok: true }
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
    assertSchemaDev(OpenDirResult, result)
    return result
  })

  // T57 — 危险操作(清空录音 / 清空模型 / 重置 App / 完全清除)。renderer 已做双重确认。
  ipcMain.handle(CHANNEL.dangerAction, async (_event, rawArgs: unknown) => {
    const { action } = DangerActionArgs.parse(rawArgs)
    let result: DangerActionResult
    try {
      const settingsFile = path.join(app.getPath('userData'), 'settings.json')
      const clearRecordings = async (): Promise<void> => await rmDir(getRecordingsDir())
      const clearModels = async (): Promise<void> => await rmDir(getModelsDir())
      const resetApp = async (): Promise<void> => await fs.rm(settingsFile, { force: true })

      // 录音中不允许清空录音 / 完全清除
      const rec = getRecorderState()
      const busy = rec.status === 'recording' || rec.status === 'stopping'
      if (busy && (action === 'clear-recordings' || action === 'wipe-all')) {
        result = { ok: false, error: 'recording-active' }
      } else {
        if (action === 'clear-recordings') await clearRecordings()
        else if (action === 'clear-models') await clearModels()
        else if (action === 'reset-app') await resetApp()
        else if (action === 'wipe-all') {
          await clearRecordings()
          await clearModels()
          await resetApp()
        }
        logger.warn('[settings] danger action done', { action })
        result = { ok: true }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      logger.error('[settings] danger action failed', { message })
      result = { ok: false, error: message }
    }
    assertSchemaDev(DangerActionResult, result)
    return result
  })
}
