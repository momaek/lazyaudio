// T31 — 模型目录路径管理。
//
// CLAUDE.md「项目运行时事实」:模型默认目录 ~/Library/Application Support/LazyAudio/models/(mac)。
// (app.setName('LazyAudio') 已在 index.ts 调,userData 路径已含 LazyAudio;dev 由 env.ts 重定向到 .local-userdata/)
// 与 recording/paths.ts 同套路:全部从 app.getPath('userData') 派生。

import path from 'node:path'
import { app } from 'electron'

export function getModelsDir(): string {
  return path.join(app.getPath('userData'), 'models')
}

export function getModelDir(modelKey: string): string {
  return path.join(getModelsDir(), modelKey)
}

/** models/manifest.json:记录已下载哪些模型 + 版本 + 字节 + 完成时间 */
export function getManifestPath(): string {
  return path.join(getModelsDir(), 'manifest.json')
}
