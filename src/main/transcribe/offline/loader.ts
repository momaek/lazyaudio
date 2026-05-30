import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'

// sherpa-onnx 平台子包目录解析 + 主进程侧「早失败提示」(transcription-pipeline §3.2)。
// 真正的 require('sherpa-onnx-node') 在 utility process(workers/asr/index.cts);这里只做
// 存在性检查,主进程过了**不代表** utility 能 require —— SIP / DYLD_* 剥离对 utility 一样生效。

export interface SherpaPlatformDirInput {
  isPackaged: boolean
  appPath: string // app.getAppPath()
  resourcesPath: string // process.resourcesPath
  platform: NodeJS.Platform
  arch: string
}

/**
 * 平台子包目录(含 .node + 平台二进制)。纯路径拼接,抽出来给单测。
 * dev: node_modules 在源码树(appPath);
 * packaged: asarUnpack 解到 app.asar.unpacked(resourcesPath 下)。
 */
export function sherpaPlatformDir(input: SherpaPlatformDirInput): string {
  const root = input.isPackaged
    ? path.join(input.resourcesPath, 'app.asar.unpacked')
    : input.appPath
  // sherpa-onnx 把 win32 子包重命名为 win(addon.js:规避 npm 对 win32 名的 spam 拦截);
  // 其它平台沿用 process.platform。这里必须与实际 npm 包名 / electron-builder asarUnpack glob 一致。
  const sherpaPlatform = input.platform === 'win32' ? 'win' : input.platform
  return path.join(root, 'node_modules', `sherpa-onnx-${sherpaPlatform}-${input.arch}`)
}

/** 主进程当前运行环境下的平台目录(包装 electron app + process) */
export function currentSherpaPlatformDir(): string {
  return sherpaPlatformDir({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    platform: process.platform,
    arch: process.arch,
  })
}

/**
 * 早失败检查:平台目录与二进制存在性。缺则 throw(供主进程在 fork 前给出清晰错误)。
 * **不** require —— 真实加载在 utility(见文件头注)。
 */
export function ensureSherpaPlatformDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    throw new Error(`sherpa-onnx platform package missing: ${dir}`)
  }
  if (process.platform === 'darwin') {
    const files = fs.readdirSync(dir)
    if (!files.some((f) => f.endsWith('.dylib'))) {
      throw new Error(`sherpa-onnx dylibs not found in: ${dir}`)
    }
    if (!files.some((f) => f.endsWith('.node'))) {
      throw new Error(`sherpa-onnx .node not found in: ${dir}`)
    }
  }
}
