// T31 — models/manifest.json 读写。
// 记录「已下载哪些模型」+ 版本 / 字节 / 完成时间。原子写沿用 settings-store 的 .tmp+rename。
// 读盘损坏 → 当空 manifest(不抛),避免一条坏记录阻断整个模型管理。

import fs from 'node:fs/promises'
import path from 'node:path'
import { getManifestPath } from './paths'
import { logger } from '../../logger'

export interface ManifestEntry {
  key: string
  version: string
  bytes: number
  files: { relPath: string; sha256: string; bytes: number }[]
  /** epoch ms */
  downloadedAt: number
}

export type Manifest = Record<string, ManifestEntry>

export async function readManifest(): Promise<Manifest> {
  try {
    const json = await fs.readFile(getManifestPath(), 'utf8')
    const parsed = JSON.parse(json)
    if (parsed && typeof parsed === 'object') return parsed as Manifest
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn(`[model] readManifest failed, treating as empty: ${String(e)}`)
    }
  }
  return {}
}

async function writeManifest(manifest: Manifest): Promise<void> {
  const finalPath = getManifestPath()
  const tmp = `${finalPath}.tmp`
  await fs.mkdir(path.dirname(finalPath), { recursive: true })
  await fs.writeFile(tmp, JSON.stringify(manifest, null, 2), 'utf8')
  await fs.rename(tmp, finalPath)
}

export async function setManifestEntry(entry: ManifestEntry): Promise<void> {
  const manifest = await readManifest()
  manifest[entry.key] = entry
  await writeManifest(manifest)
}

export async function removeManifestEntry(key: string): Promise<void> {
  const manifest = await readManifest()
  if (!(key in manifest)) return
  delete manifest[key]
  await writeManifest(manifest)
}
