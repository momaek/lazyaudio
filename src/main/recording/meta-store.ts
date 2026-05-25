// T13 — meta.json 原子读写
//
// 设计:data-model §1.4 + §10
// - 写:写 meta.json.tmp + rename → meta.json(原子);崩溃中途最多见到 .tmp 残留,
//   T15a 扫描时清理(.tmp 存在 + meta.json 也存在 → 删 .tmp;.tmp 存在 + meta.json 不在 → 提升 .tmp 为正式)
// - 读:JSON.parse + zod 校验;校验失败标 _broken 留 T15a 处理
//
// 不在这里:
// - 完整 schema migration(版本升级时由 data-model §10 处理,T13 v1)
// - 索引重建(T15 library/scanner.ts)

import fs from 'node:fs/promises'
import { app } from 'electron'
import { RecordingMeta } from '@shared/recording/meta'
import type { SessionType, Sources } from '@shared/ipc/record'
import { logger } from '../logger'
import { ensureRecordingDir, getMetaFilePath, getMetaTmpPath } from './paths'
import { SCHEMA_VERSION } from '@shared/recording/meta'

export async function writeMeta(meta: RecordingMeta): Promise<void> {
  // dev assert(schema)
  const parsed = RecordingMeta.safeParse(meta)
  if (!parsed.success) {
    throw new Error(`writeMeta: schema invalid — ${parsed.error.message}`)
  }
  await ensureRecordingDir(meta.id)
  const json = JSON.stringify(parsed.data, null, 2)
  const tmp = getMetaTmpPath(meta.id)
  const finalPath = getMetaFilePath(meta.id)
  await fs.writeFile(tmp, json, 'utf8')
  await fs.rename(tmp, finalPath)
}

export async function readMeta(recordingId: string): Promise<RecordingMeta | null> {
  try {
    const json = await fs.readFile(getMetaFilePath(recordingId), 'utf8')
    const parsed = RecordingMeta.safeParse(JSON.parse(json))
    if (!parsed.success) {
      logger.warn(`readMeta: schema invalid for ${recordingId}: ${parsed.error.message}`)
      return null
    }
    return parsed.data
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}

export function makeInitialMeta(args: {
  id: string
  title: string
  sessionType: SessionType
  sources: Sources
  startedAt: number
}): RecordingMeta {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: args.id,
    appVersion: app.getVersion(),
    title: args.title,
    sessionType: args.sessionType,
    startedAt: args.startedAt,
    durationMs: 0, // close 时填
    sources: args.sources,
    status: 'recording',
    audioFiles: {},
  }
}
