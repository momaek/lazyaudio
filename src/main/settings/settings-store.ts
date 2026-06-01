// T18 — settings.json 原子读写 + 内存缓存 + safeStorage 包装(为后续敏感字段预留)。
//
// 设计同 meta-store:写 .tmp + rename(原子);读 JSON.parse + zod 校验,失败回退默认值。
// 路径:userData/settings.json(dev 由 env.ts 重定向到 .local-userdata/)。

import fs from 'node:fs/promises'
import path from 'node:path'
import { app, safeStorage } from 'electron'
import { Settings, DEFAULT_SETTINGS, type SetArgs } from '@shared/ipc/settings'
import type { OnboardingStep, PrivacyMode } from '@shared/ipc/onboarding'
import { logger } from '../logger'

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

let cache: Settings | null = null

/** 启动时调一次:读盘 → 缓存。读不到 / 损坏 → 默认值(不抛)。 */
export async function loadSettings(): Promise<Settings> {
  try {
    const json = await fs.readFile(settingsPath(), 'utf8')
    const parsed = Settings.safeParse(JSON.parse(json))
    if (parsed.success) {
      cache = parsed.data
      return cache
    }
    logger.warn(`loadSettings: schema invalid, using defaults — ${parsed.error.message}`)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn(`loadSettings failed, using defaults: ${String(e)}`)
    }
  }
  cache = DEFAULT_SETTINGS
  return cache
}

export function getSettings(): Settings {
  return cache ?? DEFAULT_SETTINGS
}

export interface OnboardingPatch {
  completedAt?: number | undefined
  step?: OnboardingStep | undefined
  privacyMode?: PrivacyMode | undefined
  complianceReminderHidden?: boolean | undefined
}

async function persist(s: Settings): Promise<void> {
  const finalPath = settingsPath()
  const tmp = `${finalPath}.tmp`
  await fs.mkdir(path.dirname(finalPath), { recursive: true })
  await fs.writeFile(tmp, JSON.stringify(s, null, 2), 'utf8')
  await fs.rename(tmp, finalPath)
}

/** 部分更新:合并 patch → 整体校验 → 落盘 → 更新缓存。返回新的完整 settings。 */
export async function updateSettings(patch: SetArgs): Promise<Settings> {
  const current = getSettings()
  const next = mergeSettings(current, patch)
  cache = next
  await persist(next)
  return next
}

export async function updateOnboarding(patch: OnboardingPatch): Promise<Settings> {
  const current = getSettings()
  const next = Settings.parse({
    ...current,
    onboarding: { ...current.onboarding, ...patch },
  })
  cache = next
  await persist(next)
  return next
}

function mergeSettings(current: Settings, patch: SetArgs): Settings {
  // cloud:apiKey 是明文(write-only),在 main 端加密成 apiKeyCipher;其余字段直接合并
  const cloudPatch = patch.cloud ?? {}
  const { apiKey, ...cloudRest } = cloudPatch
  const nextCloud = { ...current.cloud, ...cloudRest }
  if (apiKey !== undefined) {
    nextCloud.apiKeyCipher = apiKey ? encryptSecret(apiKey) : ''
  }

  return Settings.parse({
    ...current,
    general: { ...current.general, ...(patch.general ?? {}) },
    shortcuts: { ...current.shortcuts, ...(patch.shortcuts ?? {}) },
    cloud: nextCloud,
    templates: {
      ...current.templates,
      ...(patch.templates ?? {}),
      overrides: { ...current.templates.overrides, ...(patch.templates?.overrides ?? {}) },
      templatePerSessionType: {
        ...current.templates.templatePerSessionType,
        ...(patch.templates?.templatePerSessionType ?? {}),
      },
    },
  })
}

/** main-only:取解密后的云端 API key(给 summarizer 用);未配置返回 '' */
export function getCloudApiKey(): string {
  const cipher = getSettings().cloud.apiKeyCipher
  return cipher ? decryptSecret(cipher) : ''
}

// ---- safeStorage 包装(T18 预留;云端 API key 等敏感字段在 T53/T57 用)----
// settings.json 里只存密文 base64,明文永不落盘(data-model §安全)。

export function encryptSecret(plain: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    logger.warn('safeStorage unavailable; secret not encrypted')
    return ''
  }
  return safeStorage.encryptString(plain).toString('base64')
}

export function decryptSecret(cipherB64: string): string {
  if (!cipherB64 || !safeStorage.isEncryptionAvailable()) return ''
  try {
    return safeStorage.decryptString(Buffer.from(cipherB64, 'base64'))
  } catch (e) {
    logger.warn(`decryptSecret failed: ${String(e)}`)
    return ''
  }
}
