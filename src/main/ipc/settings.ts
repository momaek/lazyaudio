// settings domain IPC handlers(T18 起接通)。
//   - settings:get   → 返回当前完整 settings
//   - settings:set   → 部分更新 + 落盘 + 应用即时副作用 + 广播 changed
//   - settings:changed → main → 所有 renderer 的状态广播(set 后推)

import { ipcMain, BrowserWindow } from 'electron'
import { CHANNEL, Settings, GetArgs, SetArgs } from '@shared/ipc/settings'
import { getSettings, updateSettings } from '../settings/settings-store'
import { applySettingsEffects } from '../settings/apply'
import { assertSchemaDev } from '../util/assert-schema'
import { logger } from '../logger'

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
}
