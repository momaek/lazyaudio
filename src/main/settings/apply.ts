// T18 — 把 settings 里有「即时副作用」的项应用到系统 / 其它子系统。
//
// 启动后(loadSettings 之后)调一次,之后每次 settings:set 也调,保持幂等:
//   - 开机自启 → app.setLoginItemSettings(mac / win)
//   - 全局快捷键 toggleRecord → registerToggleRecord(AC:改快捷键立即生效)
//
// 其余项(关闭主窗口行为 / 托盘点击 / 主题全 app / 列表密度 / 默认会话类型 / 跳过浮窗)
// 只持久化,由各自的 owner(T17 / tray / T58 / 主窗口 / prep handler)读取时生效。

import { app } from 'electron'
import { getSettings } from './settings-store'
import { registerToggleRecord } from '../shortcut/register'
import { logger } from '../logger'

export function applySettingsEffects(): void {
  const s = getSettings()

  if (process.platform === 'darwin' || process.platform === 'win32') {
    app.setLoginItemSettings({ openAtLogin: s.general.openAtLogin })
  }

  registerToggleRecord(s.shortcuts.toggleRecord)
  logger.info('settings effects applied', {
    openAtLogin: s.general.openAtLogin,
    toggleRecord: s.shortcuts.toggleRecord,
  })
}
