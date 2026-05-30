// macOS app menu(顶部 menubar 第一栏 = app 名)
// Windows / Linux 上 Electron 默认会把这个挂在主窗口 menubar 上;v0.1 主窗口走 chrome-less
// 设计,所以这套 menu 主要是给 macOS 用的,Win 上会忽略大部分(除非 setMenuBarVisibility 开)。

import { Menu, app, shell } from 'electron'
import { openSettingsWindow } from '../windows/settings-window'

export function installAppMenu(): void {
  const isMac = process.platform === 'darwin'
  if (!isMac) {
    // Win / Linux 主窗口 chrome-less,显式清掉默认 menu(否则 Electron 会塞 File/Edit/View 默认菜单)
    Menu.setApplicationMenu(null)
    return
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: '设置…',
          accelerator: 'Cmd+,',
          click: () => openSettingsWindow(),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' }, // dev only;打包后由 build 决定是否保留
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        // role: 'close' 自带 ⌘W,触发当前 focused window 的 close 事件。
        // 主窗口的 close handler(T17 state-protection)据此拦截:录音中→最小化不停录,
        // 非录音按 T18「关闭主窗口时」设置。缺这一项时 ⌘W 完全不绑定 → 按下无反应。
        { role: 'close' },
        { type: 'separator' },
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'front' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: '项目主页',
          click: () => {
            void shell.openExternal('https://github.com/momaek/lazyaudio')
          },
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
