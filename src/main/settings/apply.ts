// T18 — 把 settings 里有「即时副作用」的项应用到系统 / 其它子系统。
//
// 启动后(loadSettings 之后)调一次,之后每次 settings:set 也调,保持幂等:
//   - 开机自启 → app.setLoginItemSettings(mac / win)
//   - 全局快捷键 toggleRecord → registerToggleRecord(AC:改快捷键立即生效)
//
// 其余项(关闭主窗口行为 / 托盘点击 / 列表密度 / 默认会话类型 / 跳过浮窗)
// 只持久化,由各自的 owner(T17 / tray / 主窗口 / prep handler)读取时生效。
// T58 主题:applyThemeSource() 在这里 + 启动时调,写 nativeTheme.themeSource。

import { app, nativeTheme } from 'electron'
import { getSettings } from './settings-store'
import { registerToggleRecord } from '../shortcut/register'
import { logger } from '../logger'

/** T58 — 主题真相源:把 settings.general.theme 写进 nativeTheme.themeSource。
 *  三模式('light'|'dark'|'system')直接对应 themeSource;所有 renderer 的
 *  prefers-color-scheme 随之联动,各窗口 initTheme() 据此切 <html>.dark(全 app 同步)。
 *  启动后(loadSettings)调一次 + 每次 settings:set 调,幂等。 */
export function applyThemeSource(): void {
  nativeTheme.themeSource = getSettings().general.theme
}

export function applySettingsEffects(): void {
  const s = getSettings()

  if (process.platform === 'darwin' || process.platform === 'win32') {
    app.setLoginItemSettings({ openAtLogin: s.general.openAtLogin })
  }

  registerToggleRecord(s.shortcuts.toggleRecord)
  applyThemeSource()
  logger.info('settings effects applied', {
    openAtLogin: s.general.openAtLogin,
    toggleRecord: s.shortcuts.toggleRecord,
    theme: s.general.theme,
  })
}
