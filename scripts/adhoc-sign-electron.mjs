// dev 期对 node_modules 里的 Electron.app 做真·ad-hoc 签名。
//
// 背景(spike-005 §3 决策、tech-feasibility.md):macOS 26 Tahoe 下,Electron 自带的
// "linker-signed" 弱 ad-hoc 签名拿不到稳定 TCC 身份,导致「屏幕录制/系统音频录制」权限
// 被系统直接 deny 且不弹框 → 系统音频(getDisplayMedia loopback)采集失败。
// `codesign --force --deep --sign -` 重签成正常 ad-hoc(带 Sealed Resources)后,
// macOS 才会把它当稳定身份、正常弹授权框。
//
// 仅在 macOS 跑;非 darwin 或找不到 Electron.app 时安静跳过,绝不让 install 失败。

import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

if (process.platform !== 'darwin') {
  process.exit(0)
}

function resolveElectronApp() {
  // require('electron') 返回可执行文件路径,如 .../dist/Electron.app/Contents/MacOS/Electron
  try {
    const require = createRequire(import.meta.url)
    const exe = require('electron')
    if (typeof exe === 'string') {
      const marker = '.app/'
      const idx = exe.indexOf(marker)
      if (idx !== -1) return exe.slice(0, idx + marker.length - 1)
    }
  } catch {
    // 落到下面的固定路径兜底
  }
  const fallback = 'node_modules/electron/dist/Electron.app'
  return existsSync(fallback) ? fallback : null
}

const appPath = resolveElectronApp()
if (!appPath || !existsSync(appPath)) {
  console.warn('[adhoc-sign] 未找到 Electron.app,跳过(electron 可能尚未安装)')
  process.exit(0)
}

try {
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
  console.info(`[adhoc-sign] 已 ad-hoc 重签 ${appPath}`)
} catch (e) {
  // 签名失败不阻断 install:只是 dev 下系统音频权限会拿不到,开发者据此排查
  console.warn(`[adhoc-sign] codesign 失败(系统音频权限可能拿不到): ${e?.message ?? e}`)
}
