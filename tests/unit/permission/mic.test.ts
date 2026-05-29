// T20 — 麦克风权限纯判定单测(AC「没权限 → 提示去系统设置」的判定核心)。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const MIC = '../../../src/main/permission/mic'
const LOGGER = '../../../src/main/logger'

beforeEach(() => {
  vi.resetModules()
  vi.doMock('electron', () => ({
    systemPreferences: {
      getMediaAccessStatus: () => 'granted',
      askForMediaAccess: async () => true,
    },
    shell: { openExternal: async () => undefined },
  }))
  vi.doMock(LOGGER, () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
})

afterEach(() => {
  vi.doUnmock('electron')
  vi.doUnmock(LOGGER)
})

describe('mic permission helpers', () => {
  it('needsMicSettingsPrompt:denied / restricted 才需引导去系统设置', async () => {
    const { needsMicSettingsPrompt } = await import(MIC)
    expect(needsMicSettingsPrompt('denied')).toBe(true)
    expect(needsMicSettingsPrompt('restricted')).toBe(true)
    expect(needsMicSettingsPrompt('granted')).toBe(false)
    expect(needsMicSettingsPrompt('not-determined')).toBe(false)
    expect(needsMicSettingsPrompt('unknown')).toBe(false)
  })

  it('isMicGranted:仅 granted 放行录音', async () => {
    const { isMicGranted } = await import(MIC)
    expect(isMicGranted('granted')).toBe(true)
    for (const s of ['denied', 'restricted', 'not-determined', 'unknown'] as const) {
      expect(isMicGranted(s)).toBe(false)
    }
  })

  it('麦克风系统设置 deep link 指向隐私麦克风页', async () => {
    const { MIC_SETTINGS_DEEP_LINK } = await import(MIC)
    expect(MIC_SETTINGS_DEEP_LINK).toContain('Privacy_Microphone')
  })
})
