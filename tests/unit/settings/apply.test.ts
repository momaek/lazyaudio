// T18 — applySettingsEffects 单测。
// 验 AC「改快捷键 → 立即生效」的机制:apply 用持久化的 accel 调 registerToggleRecord
// (settings:set handler 每次都调 applySettingsEffects)。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const APPLY = '../../../src/main/settings/apply'
const STORE = '../../../src/main/settings/settings-store'
const REGISTER = '../../../src/main/shortcut/register'
const LOGGER = '../../../src/main/logger'

const setLoginItemSettings = vi.fn()
const registerToggleRecord = vi.fn()

beforeEach(() => {
  vi.resetModules()
  setLoginItemSettings.mockClear()
  registerToggleRecord.mockClear()
  vi.doMock('electron', () => ({ app: { setLoginItemSettings } }))
  vi.doMock(STORE, () => ({
    getSettings: () => ({
      schemaVersion: 1,
      general: {
        openAtLogin: true,
        closeMainWindowBehavior: 'minimize',
        showMainWindowOnLaunch: false,
        trayClickBehavior: 'menu',
        theme: 'system',
        language: 'zh-CN',
        listDensity: 'compact',
        defaultSessionType: 'last',
        skipPrepPopover: false,
      },
      shortcuts: { toggleRecord: 'Control+Alt+R' },
    }),
  }))
  vi.doMock(REGISTER, () => ({ registerToggleRecord }))
  vi.doMock(LOGGER, () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
})

afterEach(() => {
  vi.doUnmock('electron')
  vi.doUnmock(STORE)
  vi.doUnmock(REGISTER)
  vi.doUnmock(LOGGER)
})

describe('applySettingsEffects', () => {
  it('用持久化的 accel 重新注册全局快捷键', async () => {
    const { applySettingsEffects } = await import(APPLY)
    applySettingsEffects()
    expect(registerToggleRecord).toHaveBeenCalledWith('Control+Alt+R')
  })

  it('在 mac / win 上应用开机自启设置', async () => {
    const { applySettingsEffects } = await import(APPLY)
    applySettingsEffects()
    if (process.platform === 'darwin' || process.platform === 'win32') {
      expect(setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true })
    } else {
      expect(setLoginItemSettings).not.toHaveBeenCalled()
    }
  })
})
