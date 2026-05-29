// T20 — 麦克风权限检测 / 请求 / 跳系统设置。
//
// macOS:用 systemPreferences 查 TCC 状态;denied/restricted 只能引导用户去系统设置手开
// (askForMediaAccess 对已 denied 无效,只在 not-determined 时弹系统授权框)。
// 非 macOS:本简版不做权限 gate,getMicStatus 返回 'granted'(Windows 麦克风 TCC 留后续)。

import { systemPreferences, shell } from 'electron'
import type { MicStatus } from '@shared/ipc/permission'
import { logger } from '../logger'

// macOS「系统设置 → 隐私与安全性 → 麦克风」deep link
export const MIC_SETTINGS_DEEP_LINK =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'

/** 该不该弹「去系统设置开权限」提示:已拒绝 / 受限 → true(askForMediaAccess 救不了,只能去设置)。 */
export function needsMicSettingsPrompt(status: MicStatus): boolean {
  return status === 'denied' || status === 'restricted'
}

/** 能否直接录音(已授权)。granted 才放行。 */
export function isMicGranted(status: MicStatus): boolean {
  return status === 'granted'
}

export function getMicStatus(): MicStatus {
  if (process.platform !== 'darwin') return 'granted'
  try {
    return systemPreferences.getMediaAccessStatus('microphone') as MicStatus
  } catch (e) {
    logger.warn(`getMicStatus failed: ${String(e)}`)
    return 'unknown'
  }
}

/** 仅在 not-determined 时有效:弹系统授权框,返回用户最终是否允许。 */
export async function requestMic(): Promise<MicStatus> {
  if (process.platform !== 'darwin') return 'granted'
  try {
    await systemPreferences.askForMediaAccess('microphone')
  } catch (e) {
    logger.warn(`askForMediaAccess failed: ${String(e)}`)
  }
  return getMicStatus()
}

export async function openMicSettings(): Promise<boolean> {
  try {
    await shell.openExternal(MIC_SETTINGS_DEEP_LINK)
    return true
  } catch (e) {
    logger.warn(`openMicSettings failed: ${String(e)}`)
    return false
  }
}
