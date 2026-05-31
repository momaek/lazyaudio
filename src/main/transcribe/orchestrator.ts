// T32 — Pass B 离线转录编排。
//
// 触发:record:stop → mixdown 完 → enqueueTranscription(recordingId)(record.ts)。
// 流程:挑 wav(mixed>mic>system)→ 查默认模型就绪 → fork utility → runTranscribe → 写
//   transcript.json + 更新 meta.transcribe → 广播状态。失败不写 transcript,只标 meta failed。
// 串行执行(一次只 fork 一个 utility,SenseVoice 常驻 ~600MB-1GB,避免并发爆内存)。

import fs from 'node:fs/promises'
import type { UtilityProcess } from 'electron'
import { readMeta, writeMeta } from '../recording/meta-store'
import { getMixedFilePath, getAudioFilePath } from '../recording/paths'
import { spawnAsrUtility, runTranscribe } from './offline/spawn'
import { listModelEntries } from './model/registry'
import { isModelDownloaded } from './model/downloader'
import { getModelDir } from './model/paths'
import { writeTranscript } from './transcript-store'
import { Transcript, type TranscriptSegment } from '@shared/transcribe/transcript'
import type { TranscribeMeta, TranscribeStatus } from '@shared/recording/meta'
import { logger } from '../logger'

/** 转录状态广播给 renderer 的事件(由 ipc/transcribe 注入实现) */
export interface TranscribeStatusEvent {
  recordingId: string
  status: TranscribeStatus
  error?: string
  /** status==='running' 时的进度(秒) */
  processedSec?: number
  totalSec?: number
}

let broadcaster: (e: TranscribeStatusEvent) => void = () => {}
export function setTranscribeBroadcaster(fn: (e: TranscribeStatusEvent) => void): void {
  broadcaster = fn
}

/** 默认本地 ASR 模型(registry 里 isDefault 的 asr 条目) */
function defaultAsrModelKey(): string | null {
  const entry = listModelEntries().find((e) => e.kind === 'asr' && e.isDefault)
  return entry?.key ?? null
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p)
    return true
  } catch {
    return false
  }
}

/** 挑要转录的音轨:mixed > mic > system */
async function pickSource(
  recordingId: string,
): Promise<{ wavPath: string; speaker: string } | null> {
  const mixed = getMixedFilePath(recordingId)
  if (await fileExists(mixed)) return { wavPath: mixed, speaker: 'mixed' }
  const mic = getAudioFilePath(recordingId, 'mic')
  if (await fileExists(mic)) return { wavPath: mic, speaker: 'mic' }
  const system = getAudioFilePath(recordingId, 'system')
  if (await fileExists(system)) return { wavPath: system, speaker: 'system' }
  return null
}

async function patchTranscribeMeta(recordingId: string, patch: TranscribeMeta): Promise<void> {
  const meta = await readMeta(recordingId)
  if (!meta) return
  meta.transcribe = patch
  await writeMeta(meta)
}

// ---- 串行队列 ----
const queued = new Set<string>()
const queue: { recordingId: string; force: boolean }[] = []
let running = false

/** 入队一次转录。force=true 时即使已 done 也重跑(重试用)。 */
export function enqueueTranscription(recordingId: string, opts: { force?: boolean } = {}): void {
  if (queued.has(recordingId)) return
  queued.add(recordingId)
  queue.push({ recordingId, force: opts.force ?? false })
  void pump()
}

async function pump(): Promise<void> {
  if (running) return
  running = true
  try {
    while (queue.length > 0) {
      const job = queue.shift()
      if (!job) break
      queued.delete(job.recordingId)
      await transcribeOne(job.recordingId, job.force).catch((e) =>
        logger.error('[transcribe] unhandled', { recordingId: job.recordingId, err: String(e) }),
      )
    }
  } finally {
    running = false
  }
}

async function transcribeOne(recordingId: string, force: boolean): Promise<void> {
  const meta = await readMeta(recordingId)
  if (!meta) {
    logger.warn('[transcribe] no meta, skip', { recordingId })
    return
  }
  if (!force && meta.transcribe?.status === 'done') {
    logger.info('[transcribe] already done, skip', { recordingId })
    return
  }

  const source = await pickSource(recordingId)
  if (!source) {
    await patchTranscribeMeta(recordingId, { status: 'failed', error: 'no-audio' })
    broadcaster({ recordingId, status: 'failed', error: 'no-audio' })
    return
  }

  const modelKey = defaultAsrModelKey()
  if (!modelKey || !(await isModelDownloaded(modelKey))) {
    logger.info('[transcribe] model not ready', { recordingId, modelKey })
    await patchTranscribeMeta(recordingId, {
      status: 'failed',
      engine: 'local-sense-voice',
      modelKey: modelKey ?? undefined,
      error: 'model-missing',
    })
    broadcaster({ recordingId, status: 'failed', error: 'model-missing' })
    return
  }

  const startedAt = Date.now()
  await patchTranscribeMeta(recordingId, {
    status: 'running',
    engine: 'local-sense-voice',
    modelKey,
    startedAt,
  })
  broadcaster({ recordingId, status: 'running' })

  let child: UtilityProcess | null = null
  try {
    const spawned = await spawnAsrUtility()
    child = spawned.child
    const result = await runTranscribe(
      child,
      {
        type: 'transcribe',
        recordingId,
        wavPath: source.wavPath,
        modelDir: getModelDir(modelKey),
        modelKey,
        language: 'auto',
        speaker: source.speaker,
      },
      {
        onProgress: (processedSec, totalSec) =>
          broadcaster({ recordingId, status: 'running', processedSec, totalSec }),
      },
    )

    const segments: TranscriptSegment[] = result.segments.map((s, i) => ({
      segmentId: `${recordingId}-b-${i}`,
      start: s.start,
      end: s.end,
      text: s.text,
      speaker: result.speaker,
      stability: 'confirmed',
    }))

    const transcript = Transcript.parse({
      schemaVersion: 1,
      recordingId,
      pass: 'offline',
      engine: 'local-sense-voice',
      modelKey,
      language: result.language,
      generatedAt: Date.now(),
      durationMs: result.durationMs,
      segments,
    })
    await writeTranscript(transcript)
    await patchTranscribeMeta(recordingId, {
      status: 'done',
      engine: 'local-sense-voice',
      modelKey,
      startedAt,
      finishedAt: Date.now(),
    })
    broadcaster({ recordingId, status: 'done' })
    logger.info('[transcribe] done', {
      recordingId,
      segments: segments.length,
      durationMs: result.durationMs,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    logger.error('[transcribe] failed', { recordingId, message })
    await patchTranscribeMeta(recordingId, {
      status: 'failed',
      engine: 'local-sense-voice',
      modelKey,
      startedAt,
      error: message,
    })
    broadcaster({ recordingId, status: 'failed', error: message })
  } finally {
    if (child) child.kill()
  }
}
