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

export const Settings = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION.settings),
  general: GeneralSettings,
  shortcuts: ShortcutSettings,
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
}

// ---- IPC args / results ----
export const GetArgs = z.object({}).optional()
export type GetArgs = z.infer<typeof GetArgs>

/** set:部分更新(只传要改的子键);main 合并后整体校验再落盘 */
export const SetArgs = z.object({
  general: GeneralSettings.partial().optional(),
  shortcuts: ShortcutSettings.partial().optional(),
})
export type SetArgs = z.infer<typeof SetArgs>
