// globalShortcut 注册 / 注销
//
// 默认快捷键 CommandOrControl+Shift+R(macOS Cmd+Shift+R / Win Ctrl+Shift+R)。
// T18 设置 - 快捷键 tab 允许用户改,改完调 reregisterToggleRecord(newAccel) 即可。
//
// 失败处理:被别的 app 占用 → register 返回 false,我们 log warn 但不阻塞 app 启动
// (用户可去设置里换一个;onboarding 屏 5 也会让用户确认快捷键)。

import { globalShortcut } from 'electron'
import { logger } from '../logger'
import { handleToggleRecord } from './handler'

const DEFAULT_ACCEL = 'CommandOrControl+Shift+R'

let currentAccel: string | null = null

export function registerToggleRecord(accel: string = DEFAULT_ACCEL): boolean {
  if (currentAccel === accel) {
    return true
  }
  if (currentAccel) {
    globalShortcut.unregister(currentAccel)
  }
  const ok = globalShortcut.register(accel, handleToggleRecord)
  if (ok) {
    currentAccel = accel
    logger.info('global shortcut registered', { accel })
  } else {
    currentAccel = null
    logger.warn('global shortcut register FAILED — 可能被别的 app 占用', { accel })
  }
  return ok
}

export function unregisterAllShortcuts(): void {
  globalShortcut.unregisterAll()
  currentAccel = null
}
