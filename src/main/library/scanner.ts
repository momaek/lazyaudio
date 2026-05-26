import fs from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { logger } from '../logger'
import { readMeta } from '../recording/meta-store'
import { getRecordingsDir } from '../recording/paths'
import type { RecordingMeta } from '@shared/recording/meta'

/** T15 阶段的扫描结果:只返回可解析的 meta；损坏 / 缺失留给 T15a 恢复扫描处理。 */
export async function scanRecordingMetas(): Promise<RecordingMeta[]> {
  const root = getRecordingsDir()
  let dirents: Dirent[]
  try {
    dirents = await fs.readdir(root, { withFileTypes: true })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw e
  }

  const metas: RecordingMeta[] = []
  for (const dirent of dirents) {
    if (!dirent.isDirectory()) continue
    const meta = await readMeta(dirent.name).catch((e) => {
      logger.warn(`[library] read meta failed for ${dirent.name}: ${String(e)}`)
      return null
    })
    if (meta) metas.push(meta)
  }
  return metas
}
