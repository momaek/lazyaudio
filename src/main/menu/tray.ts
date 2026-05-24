// 菜单栏 Tray 图标 + dropdown
//
// 视觉 / 行为按 information-architecture §2.1 / §2.2。
//
// T10 阶段:
// - 只实现"空闲态" dropdown(开始录音 / 显示主窗口 / 设置 / 退出);
//   录音中 / 暂停中两种状态变体留给 T11 / T17 / T12 接录音状态机后追加
// - 图标用 nativeImage.createEmpty() + setTitle('LA') 占位
//   (macOS menubar 显示文字;proper template icon 留 T70 release 阶段)
// - "最近录音" 子菜单暂用空数组 placeholder;T15 库 v0.1 落地后填实

import { Tray, Menu, nativeImage, app } from 'electron'
import { showMainWindow } from '../windows/main-window'
import { openSettingsWindow } from '../windows/settings-window'
import { showPrepWindow } from '../windows/prep-window'
import { logger } from '../logger'

let tray: Tray | null = null

function buildIdleMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: '开始录音…',
      accelerator: 'CommandOrControl+Shift+R',
      click: () => showPrepWindow(),
    },
    { type: 'separator' },
    {
      label: '显示主窗口',
      accelerator: 'CommandOrControl+1',
      click: () => showMainWindow(),
    },
    {
      label: '最近录音',
      submenu: [
        // T15 库 v0.1 实施后填实;现在占位
        { label: '(空)', enabled: false },
        { type: 'separator' },
        {
          label: '在主窗口中查看全部…',
          click: () => showMainWindow(),
        },
      ],
    },
    { type: 'separator' },
    {
      label: '设置…',
      accelerator: 'CommandOrControl+,',
      click: () => openSettingsWindow(),
    },
    {
      label: '退出 LazyAudio',
      accelerator: 'CommandOrControl+Q',
      click: () => app.quit(),
    },
  ])
}

export function createTray(): Tray {
  if (tray) return tray

  // T10 占位:空图标 + setTitle 文字。proper template icon 在 T70 release 阶段加。
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setTitle('LA') // macOS menubar 显示文字
  tray.setToolTip('LazyAudio')

  const menu = buildIdleMenu()
  tray.setContextMenu(menu)

  // 左键点击在 macOS 上也展示 menu(默认行为已是 setContextMenu;此处保险)
  tray.on('click', () => {
    tray?.popUpContextMenu()
  })

  logger.info('tray created (idle state)')
  return tray
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
