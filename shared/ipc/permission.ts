// T20 — 权限引导(简版)schema。
//
// 麦克风权限状态对齐 Electron systemPreferences.getMediaAccessStatus 的返回值:
//   not-determined(没问过)/ granted / denied / restricted(家长控制等)/ unknown。
// 系统音(SCKit audio-only / CoreAudio Tap)的 TCC 无标准查询 API,本简版只管麦克风。

import { z } from 'zod'
export { PERMISSION as CHANNEL } from './channels'

export const MicStatus = z.enum(['not-determined', 'granted', 'denied', 'restricted', 'unknown'])
export type MicStatus = z.infer<typeof MicStatus>

export const GetMicStatusArgs = z.object({}).optional()
export type GetMicStatusArgs = z.infer<typeof GetMicStatusArgs>

export const MicStatusResult = z.object({ status: MicStatus })
export type MicStatusResult = z.infer<typeof MicStatusResult>

export const RequestMicArgs = z.object({}).optional()
export type RequestMicArgs = z.infer<typeof RequestMicArgs>

/** request 后的最终状态(granted = 用户在系统弹窗里点了允许) */
export const RequestMicResult = z.object({ status: MicStatus, granted: z.boolean() })
export type RequestMicResult = z.infer<typeof RequestMicResult>

export const OpenMicSettingsArgs = z.object({}).optional()
export type OpenMicSettingsArgs = z.infer<typeof OpenMicSettingsArgs>

export const OpenMicSettingsResult = z.object({ ok: z.boolean() })
export type OpenMicSettingsResult = z.infer<typeof OpenMicSettingsResult>
