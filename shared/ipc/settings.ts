// T18 — settings 域 schema + 类型。
//
// 设计来源:screen-specs/settings.md Tab1(通用)+ Tab5(快捷键)。
// T18 只落「通用 + 快捷键」两块;录音 / 转录引擎 / LLM / 隐私 / 关于 等字段
// 由 T38 / T52 / T57 等按需补(改 schemaVersion 才需破坏性 migration)。
//
// 注:settings.md 与 mockup settings.jsx 的「通用」tab 字段有冲突,按 CLAUDE.md「冲突以
// screen-specs 为准」,这里取 settings.md 的字段(启动与窗口 / 外观 / 默认会话类型)。

import { z } from 'zod'
import { SessionType } from './record'
import { SCHEMA_VERSION } from '../schema-version'
export { SETTINGS as CHANNEL } from './channels'

export const ThemeMode = z.enum(['light', 'dark', 'system'])
export type ThemeMode = z.infer<typeof ThemeMode>

export const CloseMainWindowBehavior = z.enum(['minimize', 'quit'])
export type CloseMainWindowBehavior = z.infer<typeof CloseMainWindowBehavior>

export const TrayClickBehavior = z.enum(['menu', 'record', 'window'])
export type TrayClickBehavior = z.infer<typeof TrayClickBehavior>

export const ListDensity = z.enum(['compact', 'comfortable'])
export type ListDensity = z.infer<typeof ListDensity>

/** 录前默认会话类型:'last' = 沿用上次,否则固定某类型 */
export const DefaultSessionType = z.union([z.literal('last'), SessionType])
export type DefaultSessionType = z.infer<typeof DefaultSessionType>

export const GeneralSettings = z.object({
  openAtLogin: z.boolean(),
  closeMainWindowBehavior: CloseMainWindowBehavior,
  showMainWindowOnLaunch: z.boolean(),
  trayClickBehavior: TrayClickBehavior,
  theme: ThemeMode,
  language: z.literal('zh-CN'), // v0.1 仅简体中文
  listDensity: ListDensity,
  defaultSessionType: DefaultSessionType,
  skipPrepPopover: z.boolean(),
})
export type GeneralSettings = z.infer<typeof GeneralSettings>

export const ShortcutSettings = z.object({
  /** 开始 / 停止录音的全局快捷键,Electron accelerator 字符串 */
  toggleRecord: z.string().min(1),
})
export type ShortcutSettings = z.infer<typeof ShortcutSettings>

/** T51 — 云端 LLM 配置(OpenAI 兼容)。apiKeyCipher = safeStorage 加密后的 base64,
 *  '' 表示未配置;renderer 只读密文(无法解密,safeStorage 在 main),永不见明文。 */
export const CloudSettings = z.object({
  baseUrl: z.string(),
  chatModel: z.string(),
  contextWindow: z.number().int().positive(),
  autoSummary: z.boolean(),
  apiKeyCipher: z.string(),
})
export type CloudSettings = z.infer<typeof CloudSettings>

export const DEFAULT_CLOUD: CloudSettings = {
  baseUrl: '',
  chatModel: '',
  contextWindow: 128000,
  autoSummary: true,
  apiKeyCipher: '',
}

export const Settings = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION.settings),
  general: GeneralSettings,
  shortcuts: ShortcutSettings,
  // .default 保证老 settings.json(无 cloud 字段)仍能 parse,不丢用户已有设置
  cloud: CloudSettings.default(DEFAULT_CLOUD),
})
export type Settings = z.infer<typeof Settings>

export const DEFAULT_TOGGLE_RECORD_ACCEL = 'CommandOrControl+Shift+R'

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: SCHEMA_VERSION.settings,
  general: {
    openAtLogin: false,
    closeMainWindowBehavior: 'minimize',
    showMainWindowOnLaunch: false,
    trayClickBehavior: 'menu',
    theme: 'system',
    language: 'zh-CN',
    listDensity: 'compact',
    defaultSessionType: 'last',
    skipPrepPopover: false,
  },
  shortcuts: {
    toggleRecord: DEFAULT_TOGGLE_RECORD_ACCEL,
  },
  cloud: DEFAULT_CLOUD,
}

// ---- IPC args / results ----
export const GetArgs = z.object({}).optional()
export type GetArgs = z.infer<typeof GetArgs>

/** cloud 的 set:非密钥字段直接传;apiKey 传**明文**,main 端 encrypt 成 apiKeyCipher
 *  (renderer 不传 apiKeyCipher;空串 apiKey = 清除密钥) */
export const CloudSetArgs = z.object({
  baseUrl: z.string().optional(),
  chatModel: z.string().optional(),
  contextWindow: z.number().int().positive().optional(),
  autoSummary: z.boolean().optional(),
  apiKey: z.string().optional(),
})
export type CloudSetArgs = z.infer<typeof CloudSetArgs>

/** set:部分更新(只传要改的子键);main 合并后整体校验再落盘 */
export const SetArgs = z.object({
  general: GeneralSettings.partial().optional(),
  shortcuts: ShortcutSettings.partial().optional(),
  cloud: CloudSetArgs.optional(),
})
export type SetArgs = z.infer<typeof SetArgs>
