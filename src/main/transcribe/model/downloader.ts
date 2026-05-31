// T31 — 模型下载器(transcription-pipeline.md §5.2/§5.4/§5.5)。
//
// downloadModel:遍历 files → 每个 file 遍历源(默认顺序 + 可选 HEAD 测速)→ 断点续传(Range)
//   → 边下边算 sha256 → 校验不过删 partial 切下一源 → 成功 rename → writeManifest → done。
// 断点元数据不另存:partial 文件本身即进度,resume 时重新 hash 已落盘部分(实现策略,比另存
//   sha-so-far 元数据更不易腐坏)。
// 进度 / 源切换 / 完成 / 失败 / 取消 经 onEvent 回调外发(由 ipc 层广播到 renderer)。

import fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { app } from 'electron'
import type { ModelEvent, ModelListEntry, ModelStatus } from '@shared/ipc/model'
import { getModelEntry, listModelEntries, resolveSourceUrl, type ModelEntry } from './registry'
import { getModelDir } from './paths'
import { orderSources, probeFastest } from './mirror'
import { verifyFile, fileMatches } from './verify'
import { readManifest, setManifestEntry, removeManifestEntry } from './manifest'
import { logger } from '../../logger'

export class AllSourcesFailedError extends Error {
  constructor(public readonly relPath: string) {
    super(`all sources failed for ${relPath}`)
    this.name = 'AllSourcesFailedError'
  }
}

class DownloadCancelledError extends Error {
  constructor() {
    super('download cancelled')
    this.name = 'DownloadCancelledError'
  }
}

interface Inflight {
  controller: AbortController
  downloadedBytes: number
  totalBytes: number
}

const inflight = new Map<string, Inflight>()

type EmitFn = (event: ModelEvent) => void

const PROGRESS_THROTTLE_MS = 250

/** 流式把 partial 已落盘部分喂进 hash(resume 时为续传文件 seed sha256) */
function seedHashFromFile(filePath: string, hash: ReturnType<typeof createHash>): Promise<void> {
  return new Promise((resolve, reject) => {
    createReadStream(filePath)
      .on('data', (c) => hash.update(c))
      .on('end', resolve)
      .on('error', reject)
  })
}

/**
 * 单文件断点续传下载。返回最终 sha256 + 字节数。
 * onChunk(absoluteDownloadedForThisFile) — 本文件累计已下载(含 resume 起点)。
 */
async function downloadFileWithResume(
  url: string,
  destPath: string,
  expectedBytes: number,
  onChunk: (fileDownloaded: number) => void,
  signal: AbortSignal,
): Promise<{ sha256: string; bytes: number }> {
  const partial = `${destPath}.partial`
  let offset = 0
  try {
    offset = (await fs.stat(partial)).size
  } catch {
    offset = 0
  }
  // 已下满甚至超出 → 不可信,从头来
  if (offset >= expectedBytes) {
    offset = 0
    await fs.rm(partial, { force: true })
  }

  const headers: Record<string, string> = {}
  if (offset > 0) headers['Range'] = `bytes=${offset}-`

  const res = await fetch(url, { headers, redirect: 'follow', signal })
  // 请求了 Range 但服务端没按 206 续传 → 全量重下
  let resume = offset > 0 && res.status === 206
  if (offset > 0 && res.status !== 206) {
    logger.warn(`[model] server ignored Range (status ${res.status}), restarting full download`)
    resume = false
    offset = 0
    await fs.rm(partial, { force: true })
  }
  if (!res.ok && res.status !== 206) {
    throw new Error(`HTTP ${res.status} for ${url}`)
  }
  if (!res.body) throw new Error(`empty body for ${url}`)

  const hash = createHash('sha256')
  if (resume) await seedHashFromFile(partial, hash)

  const fh = await fs.open(partial, resume ? 'a' : 'w')
  let downloaded = resume ? offset : 0
  try {
    const nodeStream = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0])
    for await (const chunk of nodeStream) {
      if (signal.aborted) throw new DownloadCancelledError()
      const buf = chunk as Buffer
      await fh.write(buf)
      hash.update(buf)
      downloaded += buf.length
      onChunk(downloaded)
    }
  } finally {
    await fh.close()
  }

  return { sha256: hash.digest('hex'), bytes: downloaded }
}

/** 某模型当前是否已完整下载(manifest 有记录 + 各文件存在且字节数对) */
async function isDownloaded(entry: ModelEntry): Promise<boolean> {
  const manifest = await readManifest()
  if (!manifest[entry.key]) return false
  const dir = getModelDir(entry.key)
  for (const file of entry.files) {
    try {
      const stat = await fs.stat(path.join(dir, file.relPath))
      if (stat.size !== file.bytes) return false
    } catch {
      return false
    }
  }
  return true
}

/** 列出所有模型 + 磁盘状态(downloading 状态由 inflight 覆盖) */
export async function listModels(): Promise<ModelListEntry[]> {
  const entries = listModelEntries()
  const out: ModelListEntry[] = []
  for (const entry of entries) {
    const active = inflight.get(entry.key)
    let status: ModelStatus
    if (active) status = 'downloading'
    else status = (await isDownloaded(entry)) ? 'downloaded' : 'available'
    out.push({
      key: entry.key,
      displayName: entry.displayName,
      description: entry.description,
      lang: entry.lang,
      version: entry.version,
      kind: entry.kind,
      sizeBytes: entry.sizeBytes,
      isDefault: entry.isDefault,
      status,
      downloadedBytes: active?.downloadedBytes,
    })
  }
  return out
}

/** 某模型是否已完整下载(给转录编排器判断模型就绪用) */
export async function isModelDownloaded(modelKey: string): Promise<boolean> {
  const entry = getModelEntry(modelKey)
  if (!entry) return false
  return isDownloaded(entry)
}

/** 触发取消(若该 key 正在下载) */
export function cancelDownload(modelKey: string): boolean {
  const active = inflight.get(modelKey)
  if (!active) return false
  active.controller.abort()
  return true
}

export function isDownloading(modelKey: string): boolean {
  return inflight.has(modelKey)
}

/** 删除已下载模型(目录 + manifest 记录) */
export async function deleteModel(modelKey: string): Promise<void> {
  if (inflight.has(modelKey)) cancelDownload(modelKey)
  await fs.rm(getModelDir(modelKey), { recursive: true, force: true })
  await removeManifestEntry(modelKey)
}

/**
 * 下载一个模型。串行下各文件、每文件按源顺序 fallback。进度经 onEvent 外发。
 * 已在下载中则直接返回(幂等)。
 */
export async function downloadModel(modelKey: string, onEvent: EmitFn): Promise<void> {
  const entry = getModelEntry(modelKey)
  if (!entry) throw new Error(`unknown model: ${modelKey}`)
  if (inflight.has(modelKey)) {
    logger.warn(`[model] download already in progress: ${modelKey}`)
    return
  }

  const controller = new AbortController()
  const totalBytes = entry.sizeBytes
  const state: Inflight = { controller, downloadedBytes: 0, totalBytes }
  inflight.set(modelKey, state)

  const dir = getModelDir(modelKey)
  const startTime = Date.now()

  const firstFile = entry.files[0]
  if (!firstFile) throw new Error(`model ${modelKey} has no files`)

  // 源排序:默认(按 locale)+ 尽力 HEAD 测速
  let order = orderSources(entry.sources, app.getLocale())
  try {
    const probed = await probeFastest(order, (src) => resolveSourceUrl(src, firstFile.relPath))
    if (probed) order = probed
  } catch {
    /* 测速失败不阻塞,用默认顺序 */
  }

  const primarySource = order[0] ?? ''
  onEvent({ phase: 'start', modelKey, totalBytes, source: primarySource })
  logger.info('[model] download start', { modelKey, totalBytes, source: primarySource })

  // 进度节流 + 速率窗口
  let lastEmit = 0
  let windowTime = Date.now()
  let windowBytes = 0
  const emitProgress = (downloadedAll: number, force = false): void => {
    state.downloadedBytes = downloadedAll
    const now = Date.now()
    if (!force && now - lastEmit < PROGRESS_THROTTLE_MS) return
    const dt = (now - windowTime) / 1000
    const bytesPerSec = dt > 0 ? Math.max(0, (downloadedAll - windowBytes) / dt) : 0
    const etaMs = bytesPerSec > 0 ? ((totalBytes - downloadedAll) / bytesPerSec) * 1000 : 0
    onEvent({
      phase: 'progress',
      modelKey,
      downloadedBytes: downloadedAll,
      totalBytes,
      bytesPerSec,
      etaMs,
    })
    lastEmit = now
    windowTime = now
    windowBytes = downloadedAll
  }

  try {
    await fs.mkdir(dir, { recursive: true })
    let baseDownloaded = 0 // 已完成文件的字节和

    for (const file of entry.files) {
      const dest = path.join(dir, file.relPath)
      // 已存在且校验通过 → 跳过(支持中断后续传到文件级)
      if (await fileMatches(dest, file.sha256, file.bytes)) {
        baseDownloaded += file.bytes
        emitProgress(baseDownloaded)
        continue
      }

      let done = false
      for (const [i, source] of order.entries()) {
        const url = resolveSourceUrl(source, file.relPath)
        const nextSource = order[i + 1]
        try {
          const result = await downloadFileWithResume(
            url,
            dest,
            file.bytes,
            (fileDownloaded) => emitProgress(baseDownloaded + fileDownloaded),
            controller.signal,
          )
          const partial = `${dest}.partial`
          if (result.sha256 !== file.sha256) {
            logger.warn('[model] checksum mismatch, switching source', {
              modelKey,
              relPath: file.relPath,
              source,
            })
            await fs.rm(partial, { force: true })
            if (nextSource) {
              onEvent({
                phase: 'source-switched',
                modelKey,
                from: source,
                to: nextSource,
                reason: 'checksum',
              })
            }
            continue
          }
          await fs.rename(partial, dest)
          baseDownloaded += file.bytes
          emitProgress(baseDownloaded, true)
          done = true
          break
        } catch (e) {
          if (controller.signal.aborted) throw new DownloadCancelledError()
          logger.warn('[model] source failed, trying next', {
            modelKey,
            relPath: file.relPath,
            source,
            err: String(e),
          })
          if (nextSource) {
            onEvent({
              phase: 'source-switched',
              modelKey,
              from: source,
              to: nextSource,
              reason: 'network',
            })
          }
        }
      }
      if (!done) throw new AllSourcesFailedError(file.relPath)
    }

    await setManifestEntry({
      key: entry.key,
      version: entry.version,
      bytes: entry.sizeBytes,
      files: entry.files.map((f) => ({ relPath: f.relPath, sha256: f.sha256, bytes: f.bytes })),
      downloadedAt: Date.now(),
    })

    // 最终整模型再做一次完整校验(防 manifest 与磁盘不一致)
    for (const file of entry.files) {
      await verifyFile(path.join(dir, file.relPath), file.sha256, file.bytes)
    }
    logger.info('[model] verify ok', { modelKey, durationMs: Date.now() - startTime })
    onEvent({ phase: 'done', modelKey, durationMs: Date.now() - startTime })
  } catch (e) {
    if (e instanceof DownloadCancelledError || controller.signal.aborted) {
      logger.info('[model] download cancelled', { modelKey })
      onEvent({ phase: 'cancelled', modelKey })
    } else {
      const code = e instanceof AllSourcesFailedError ? 'all-sources-failed' : 'unknown'
      const message = e instanceof Error ? e.message : String(e)
      logger.error('[model] download error', { modelKey, code, message })
      onEvent({ phase: 'error', modelKey, code, message })
    }
  } finally {
    inflight.delete(modelKey)
  }
}
