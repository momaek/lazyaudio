// T32 — Pass B 离线转录编排。
//
// 触发:record:stop → mixdown 完 → enqueueTranscription(recordingId)(record.ts)。
// 流程:挑 wav(mixed>mic>system)→ 查默认模型就绪 → fork utility → runTranscribe → 写
//   transcript.json + 更新 meta.transcribe → 广播状态。失败不写 transcript,只标 meta failed。
// 串行执行(一次只 fork 一个 utility,SenseVoice 常驻 ~600MB-1GB,避免并发爆内存)。

import path from 'node:path'
import fs from 'node:fs/promises'
import type { UtilityProcess } from 'electron'
import type { Sources } from '@shared/ipc/record'
import { readMeta, writeMeta } from '../recording/meta-store'
import { getMixedFilePath, getAudioFilePath } from '../recording/paths'
import { spawnAsrUtility, runTranscribe, type TranscribeRunResult } from './offline/spawn'
import { runCloudTranscribe } from './offline/openai-compatible'
import { startStreamingSession, type StreamingSession } from './streaming/spawn'
import { listModelEntries, SILERO_VAD_KEY } from './model/registry'
import { isModelDownloaded, downloadModel } from './model/downloader'
import { getModelDir } from './model/paths'
import { writeTranscript } from './transcript-store'
import { writeLiveTranscript } from './live-store'
import { summarize, isCloudConfigured } from '../llm/summarizer'
import { getSettings, getCloudApiKey } from '../settings/settings-store'
import { Transcript, type TranscriptSegment } from '@shared/transcribe/transcript'
import type { LiveSegment } from '@shared/transcribe/streaming-protocol'
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

/** Pass A 实时段广播(由 ipc/transcribe 注入) */
let liveBroadcaster: (recordingId: string, seg: LiveSegment) => void = () => {}
export function setLiveBroadcaster(fn: (recordingId: string, seg: LiveSegment) => void): void {
  liveBroadcaster = fn
}

/** Pass B 完成后通知 renderer 整体换 transcript.json(由 ipc/transcribe 注入) */
let overwriteBroadcaster: (recordingId: string) => void = () => {}
export function setOverwriteBroadcaster(fn: (recordingId: string) => void): void {
  overwriteBroadcaster = fn
}

/** 默认本地 ASR 模型(registry 里 isDefault 的 asr 条目) */
function defaultAsrModelKey(): string | null {
  const entry = listModelEntries().find((e) => e.kind === 'asr' && e.isDefault)
  return entry?.key ?? null
}

// ============ Pass A 实时转录(T34/T36) ============

interface LiveState {
  recordingId: string
  session: StreamingSession
  segments: Map<string, LiveSegment>
  startedAt: number
  modelKey: string
}
let live: LiveState | null = null

/** 确保模型就绪;缺则尝试下载(VAD 仅 643KB)。返回是否可用。 */
async function ensureModel(modelKey: string): Promise<boolean> {
  if (await isModelDownloaded(modelKey)) return true
  try {
    await downloadModel(modelKey, () => {})
    return await isModelDownloaded(modelKey)
  } catch (e) {
    logger.warn('[passA] model download failed', { modelKey, err: String(e) })
    return false
  }
}

/** 把当前 live 段落落盘 transcript.live.json(只持久化 confirmed;hypothesis 只走 IPC) */
async function persistLive(state: LiveState, partial: boolean): Promise<void> {
  const segs = [...state.segments.values()]
    .filter((s) => s.stability === 'confirmed')
    .sort((a, b) => a.start - b.start)
    .map<TranscriptSegment>((s) => ({
      segmentId: s.segmentId,
      start: s.start,
      end: s.end,
      text: s.text,
      speaker: s.speaker,
      stability: 'confirmed',
    }))
  if (segs.length === 0 && partial) return
  const transcript = Transcript.parse({
    schemaVersion: 1,
    recordingId: state.recordingId,
    pass: 'live',
    engine: 'local-vad-shortwin',
    modelKey: state.modelKey,
    language: 'auto',
    generatedAt: Date.now(),
    durationMs: Date.now() - state.startedAt,
    segments: segs,
    partial,
  })
  await writeLiveTranscript(transcript).catch((e) =>
    logger.warn('[passA] writeLive failed', { err: String(e) }),
  )
}

/** record:start 后调:起 Pass A 实时会话。模型缺 / spawn 失败 → 降级(不起 live,录音照常)。 */
export async function startLive(recordingId: string, _sources: Sources): Promise<void> {
  if (live) {
    logger.warn('[passA] already active, skip', { recordingId })
    return
  }
  // T53/PRD F4.9 — 云端模式默认禁 Pass A 实时转录(只跑录后 Pass B 云端转录)
  if (getSettings().onboarding.privacyMode === 'cloud') {
    logger.info('[passA] cloud mode, skip live captions (PRD F4.9)', { recordingId })
    return
  }
  const asrKey = defaultAsrModelKey()
  if (!asrKey || !(await isModelDownloaded(asrKey))) {
    logger.info('[passA] asr model not ready, skip live captions', { recordingId })
    return
  }
  if (!(await ensureModel(SILERO_VAD_KEY))) {
    logger.info('[passA] vad model unavailable, skip live captions', { recordingId })
    return
  }

  const segments = new Map<string, LiveSegment>()
  const startedAt = Date.now()
  try {
    const session = await startStreamingSession({
      recordingId,
      modelDir: getModelDir(asrKey),
      vadModelPath: path.join(getModelDir(SILERO_VAD_KEY), 'silero_vad.onnx'),
      language: 'auto',
      speaker: 'mixed', // v0.1:mic+system 合一路
      onSegment: (seg) => {
        if (!live || live.recordingId !== recordingId) return
        live.segments.set(seg.segmentId, seg)
        liveBroadcaster(recordingId, seg)
        if (seg.stability === 'confirmed') void persistLive(live, true)
      },
    })
    live = { recordingId, session, segments, startedAt, modelKey: asrKey }
    logger.info('[passA] live started', { recordingId })
  } catch (e) {
    logger.warn('[passA] start failed, degraded (no live captions)', {
      recordingId,
      err: String(e),
    })
    live = null
  }
}

/** pcm-fork 调:喂一块 16k mono Int16 给 Pass A */
export function pushLivePcm(recordingId: string, int16: Int16Array): void {
  if (!live || live.recordingId !== recordingId) return
  live.session.pushPcm(int16)
}

export function isLiveActive(recordingId: string): boolean {
  return live?.recordingId === recordingId
}

/** record:stop 时调(早于 Pass B):停 Pass A、等退出、落盘 final live transcript(T36 串行切换的前半) */
export async function stopLive(recordingId: string): Promise<void> {
  const state = live
  if (!state || state.recordingId !== recordingId) return
  live = null
  try {
    await state.session.stop() // flush + 等 flushed(≤5s)+ kill
  } catch (e) {
    logger.warn('[passA] stop error', { recordingId, err: String(e) })
  }
  await persistLive(state, false)
  logger.info('[passA] live stopped', { recordingId, segments: state.segments.size })
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

  // T53 — privacyMode='cloud' 走云端 Pass B(OpenAI 兼容);否则本地 SenseVoice
  if (getSettings().onboarding.privacyMode === 'cloud') {
    await transcribeCloud(recordingId, source)
  } else {
    await transcribeLocal(recordingId, source)
  }
}

/** 写 transcript.json + 标 meta done + 广播 + (配了云端则)触发自动摘要。本地 / 云端共用。 */
async function finishTranscript(
  recordingId: string,
  engine: NonNullable<TranscribeMeta['engine']>,
  modelKey: string,
  startedAt: number,
  idPrefix: string,
  result: TranscribeRunResult,
): Promise<void> {
  const segments: TranscriptSegment[] = result.segments.map((s, i) => ({
    segmentId: `${recordingId}-${idPrefix}-${i}`,
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
    engine,
    modelKey,
    language: result.language,
    generatedAt: Date.now(),
    durationMs: result.durationMs,
    segments,
  })
  await writeTranscript(transcript)
  await patchTranscribeMeta(recordingId, {
    status: 'done',
    engine,
    modelKey,
    startedAt,
    finishedAt: Date.now(),
  })
  broadcaster({ recordingId, status: 'done' })
  overwriteBroadcaster(recordingId) // T36:Pass B 覆盖 → renderer 整体换 transcript.json
  logger.info('[transcribe] done', {
    recordingId,
    engine,
    segments: segments.length,
    durationMs: result.durationMs,
  })
  // T51:转录完且云端已配置 + autoSummary → 自动生成摘要(失败只记 meta,不影响转录)
  if (isCloudConfigured() && getSettings().cloud.autoSummary) {
    void summarize(recordingId)
  }
}

/** 本地 Pass B:fork SenseVoice utility 转录。 */
async function transcribeLocal(
  recordingId: string,
  source: { wavPath: string; speaker: string },
): Promise<void> {
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

  // Pass B 默认走定窗切片。VAD 分段(T61 实验)经 dogfood A/B 否决——CER +0.9(圆桌最差),
  // 见 tech-feasibility「Pass B VAD 分段实验」。worker 仍支持 vadModelPath(留作将来调参),
  // 这里默认不传 → 走定窗。
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
    await finishTranscript(recordingId, 'local-sense-voice', modelKey, startedAt, 'b', result)
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

/** 云端 Pass B(T53):上传 WAV 到 OpenAI 兼容 Audio API 拿 segments。 */
async function transcribeCloud(
  recordingId: string,
  source: { wavPath: string; speaker: string },
): Promise<void> {
  const { cloud } = getSettings()
  const apiKey = getCloudApiKey()
  if (!cloud.baseUrl || !cloud.transcribeModel || !apiKey) {
    logger.info('[transcribe] cloud not configured', { recordingId })
    await patchTranscribeMeta(recordingId, {
      status: 'failed',
      engine: 'openai-compatible',
      error: 'cloud-not-configured',
    })
    broadcaster({ recordingId, status: 'failed', error: 'cloud-not-configured' })
    return
  }

  const startedAt = Date.now()
  await patchTranscribeMeta(recordingId, {
    status: 'running',
    engine: 'openai-compatible',
    modelKey: cloud.transcribeModel,
    startedAt,
  })
  broadcaster({ recordingId, status: 'running' })

  try {
    const result = await runCloudTranscribe({
      wavPath: source.wavPath,
      speaker: source.speaker,
      language: 'auto',
      baseUrl: cloud.baseUrl,
      apiKey,
      model: cloud.transcribeModel,
    })
    await finishTranscript(
      recordingId,
      'openai-compatible',
      cloud.transcribeModel,
      startedAt,
      'cloud',
      result,
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    logger.error('[transcribe] cloud failed', { recordingId, message })
    await patchTranscribeMeta(recordingId, {
      status: 'failed',
      engine: 'openai-compatible',
      modelKey: cloud.transcribeModel,
      startedAt,
      error: message,
    })
    broadcaster({ recordingId, status: 'failed', error: message })
  }
}
