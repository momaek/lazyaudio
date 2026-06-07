// T18 — settings-store 持久化单测。
// mock electron(app.getPath → 临时目录 + safeStorage)+ logger,跑 write → reload roundtrip,
// 验 AC「改设置 → 重启 → 还在」(reload = 全新模块 + 全新内存缓存 = 模拟重启)。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DEFAULT_SETTINGS, SetArgs } from '@shared/ipc/settings'

const STORE = '../../../src/main/settings/settings-store'
const LOGGER = '../../../src/main/logger'

let tmpDir: string

beforeEach(async () => {
  vi.resetModules()
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lazyaudio-settings-'))
  vi.doMock('electron', () => ({
    app: { getPath: () => tmpDir },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s: string) => Buffer.from(s, 'utf8'),
      decryptString: (b: Buffer) => b.toString('utf8'),
    },
  }))
  vi.doMock(LOGGER, () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  }))
})

afterEach(async () => {
  vi.doUnmock('electron')
  vi.doUnmock(LOGGER)
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('settings-store', () => {
  it('读不到 settings.json 时回退默认值', async () => {
    const store = await import(STORE)
    const loaded = await store.loadSettings()
    expect(loaded).toEqual(DEFAULT_SETTINGS)
  })

  it('updateSettings 部分更新只改目标键,其它保持', async () => {
    const store = await import(STORE)
    await store.loadSettings()
    const next = await store.updateSettings({ general: { openAtLogin: true } })
    expect(next.general.openAtLogin).toBe(true)
    // 其它字段保持默认
    expect(next.general.theme).toBe(DEFAULT_SETTINGS.general.theme)
    expect(next.shortcuts.toggleRecord).toBe(DEFAULT_SETTINGS.shortcuts.toggleRecord)
  })

  // 回归:经 SetArgs.parse 的部分 patch 不能用字段默认值覆盖其它已设字段。
  // zod .partial() 不剥 .default(),曾导致「改静音秒数把开关打回 false」。
  it('SetArgs.parse 后的部分 recording patch 不污染其它字段', async () => {
    const store = await import(STORE)
    await store.loadSettings()
    // 先打开静音自停
    await store.updateSettings(SetArgs.parse({ recording: { silenceAutoStopEnabled: true } }))
    // 只改秒数:不应把 silenceAutoStopEnabled 打回默认 false,也不动分轨/混音
    const next = await store.updateSettings(
      SetArgs.parse({ recording: { silenceAutoStopSec: 90 } }),
    )
    expect(next.recording.silenceAutoStopSec).toBe(90)
    expect(next.recording.silenceAutoStopEnabled).toBe(true)
    expect(next.recording.generateTracks).toBe(DEFAULT_SETTINGS.recording.generateTracks)
  })

  it('改设置 → 落盘 settings.json', async () => {
    const store = await import(STORE)
    await store.loadSettings()
    await store.updateSettings({ shortcuts: { toggleRecord: 'Alt+Shift+9' } })
    const raw = await fs.readFile(path.join(tmpDir, 'settings.json'), 'utf8')
    expect(JSON.parse(raw).shortcuts.toggleRecord).toBe('Alt+Shift+9')
  })

  it('改设置 → 重启 → 还在(全新模块 reload 读回)', async () => {
    const a = await import(STORE)
    await a.loadSettings()
    await a.updateSettings({
      general: { openAtLogin: true, theme: 'dark' },
      shortcuts: { toggleRecord: 'Control+Alt+R' },
    })

    // 模拟重启:清模块缓存 → 全新 import(内存 cache 归零)→ 只能从盘读
    vi.resetModules()
    const b = await import(STORE)
    const reloaded = await b.loadSettings()
    expect(reloaded.general.openAtLogin).toBe(true)
    expect(reloaded.general.theme).toBe('dark')
    expect(reloaded.shortcuts.toggleRecord).toBe('Control+Alt+R')
  })

  it('safeStorage 包装可 encrypt/decrypt roundtrip', async () => {
    const store = await import(STORE)
    const cipher = store.encryptSecret('sk-secret-123')
    expect(cipher).not.toBe('')
    expect(store.decryptSecret(cipher)).toBe('sk-secret-123')
  })

  it('updateOnboarding 持久化步骤和完成状态', async () => {
    const store = await import(STORE)
    await store.loadSettings()
    const next = await store.updateOnboarding({
      step: 'privacy',
      privacyMode: 'cloud',
      complianceReminderHidden: true,
    })
    expect(next.onboarding.step).toBe('privacy')
    expect(next.onboarding.privacyMode).toBe('cloud')
    expect(next.onboarding.complianceReminderHidden).toBe(true)

    await store.updateOnboarding({ completedAt: 123, step: 'done' })
    vi.resetModules()
    const reloadedStore = await import(STORE)
    const reloaded = await reloadedStore.loadSettings()
    expect(reloaded.onboarding.completedAt).toBe(123)
    expect(reloaded.onboarding.step).toBe('done')
    expect(reloaded.onboarding.privacyMode).toBe('cloud')
  })

  it('updateSettings 持久化 LLM 模板覆盖和 sessionType 映射', async () => {
    const store = await import(STORE)
    await store.loadSettings()
    const next = await store.updateSettings({
      templates: {
        overrides: { meeting: { systemPrompt: 'custom prompt', sessionTypes: ['meeting'] } },
        templatePerSessionType: { general: 'meeting' },
      },
    })
    expect(next.templates.overrides.meeting?.systemPrompt).toBe('custom prompt')
    expect(next.templates.templatePerSessionType.general).toBe('meeting')

    vi.resetModules()
    const reloadedStore = await import(STORE)
    const reloaded = await reloadedStore.loadSettings()
    expect(reloaded.templates.overrides.meeting?.sessionTypes).toEqual(['meeting'])
    expect(reloaded.templates.templatePerSessionType.general).toBe('meeting')
  })
})
