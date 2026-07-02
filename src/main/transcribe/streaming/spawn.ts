// T34 — fork Pass A streaming utility + init 握手,返回会话句柄(pushPcm / stop)。
// 镜像 offline/spawn.ts;stop 发 stop 消息、等 flushed(≤5s 强杀),保证 Pass A 退出后再 fork Pass B。
//
// T61 进程回收:sherpa OfflineStream 无 free,长录音原生内存只增不减(见 tech-feasibility
// 「OfflineStream 原生内存泄漏」)。进程退出是唯一回收路径。worker 在段边界(confirmed 刚落定、
// curBuf 已空)按 RSS 阈值发 recycle-needed;本会话在那个安全点 kill 旧 worker、fork 新 worker,
// 并从「上次 confirmed 水位」续接:
//   - 偏移(segCounterOffset / sampleOffset)由 main 从已收到的 confirmed 段推导(end×16k、seg-N+1),
//     新 worker 续号续时间轴 → segmentId 不撞、时间戳连续;in-flight 段在新 worker 用同一 id 重建
//     (走 spike-013 hypothesis→confirmed 原地替换),不丢不重。
//   - main 维护一个 PCM 环形缓冲(只留水位之后的),refork 后从水位精确重放再恢复直送。
// 对调用方透明:pushPcm / stop 不变。

import path from 'node:path'
import { utilityProcess, type UtilityProcess } from 'electron'
import { logger } from '../../logger'
import { currentSherpaPlatformDir, ensureSherpaPlatformDir } from '../offline/loader'
import type {
  StreamingEvent,
  StreamingTask,
  LiveSegment,
  LiveRecognitionDebug,
} from '@shared/transcribe/streaming-protocol'

const SPAWN_TIMEOUT_MS = 15_000
const FLUSH_TIMEOUT_MS = 5_000
const SAMPLE_RATE = 16_000

export interface StreamingSession {
  readonly recordingId: string
  pushPcm(int16: Int16Array): void
  /** 发 stop → 等 flushed(≤5s 强杀)→ kill。resolve 即 Pass A 已退出。 */
  stop(): Promise<void>
}

interface ForkOpts {
  platformDir: string
  modelDir: string
  vadModelPath: string
  recordingId: string
  language: string
  speaker: string
}

/** fork utility + spawn 握手 + init 握手(带续接偏移)。resolve 即 worker ready,可推 PCM。 */
async function forkAndInit(
  opts: ForkOpts,
  offsets: { segCounterOffset: number; sampleOffset: number },
): Promise<UtilityProcess> {
  const entry = path.join(__dirname, 'streaming-asr.js')
  const child = utilityProcess.fork(entry, [], { serviceName: 'lazyaudio-streaming-asr' })

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      child.kill()
      reject(new Error('streaming spawn timeout'))
    }, SPAWN_TIMEOUT_MS)
    child.once('spawn', () => {
      clearTimeout(t)
      resolve()
    })
  })

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error('streaming init timeout'))
    }, SPAWN_TIMEOUT_MS)
    const onMsg = (raw: StreamingEvent): void => {
      if (raw.type === 'ready') {
        clearTimeout(timeout)
        child.removeListener('message', onMsg)
        logger.info('[passA] utility ready', { sherpaVersion: raw.sherpaVersion })
        resolve()
      } else if (raw.type === 'fatal') {
        clearTimeout(timeout)
        child.removeListener('message', onMsg)
        child.kill()
        logger.error('[passA] utility fatal', { code: raw.code, detail: raw.detail })
        reject(new Error(`streaming fatal: ${raw.code}`))
      }
    }
    child.on('message', onMsg)
    child.once('exit', (code) => {
      clearTimeout(timeout)
      reject(new Error(`streaming exited early: code=${code}`))
    })
    const init: StreamingTask = {
      type: 'init',
      platformDir: opts.platformDir,
      modelDir: opts.modelDir,
      vadModelPath: opts.vadModelPath,
      recordingId: opts.recordingId,
      language: opts.language,
      speaker: opts.speaker,
      segCounterOffset: offsets.segCounterOffset,
      sampleOffset: offsets.sampleOffset,
    }
    child.postMessage(init)
  })

  return child
}

/** `seg-N` → N(解析失败返回 null,不更新水位) */
function parseSegNum(segmentId: string): number | null {
  const m = /^seg-(\d+)$/.exec(segmentId)
  return m ? Number(m[1]) : null
}

function postPcm(child: UtilityProcess, recordingId: string, int16: Int16Array): void {
  // slice() → 精确大小的独立 buffer:int16 可能是 subarray view(重放时),直接取 .buffer 会带上
  // 整个底层 buffer 而忽略偏移。16k mono 块仅 KB 级,拷贝可忽略。
  const buf = int16.slice().buffer
  const msg: StreamingTask = { type: 'pcm', recordingId, pcm: buf as ArrayBuffer }
  child.postMessage(msg)
}

export async function startStreamingSession(opts: {
  recordingId: string
  modelDir: string
  vadModelPath: string
  language: string
  speaker: string
  onSegment: (seg: LiveSegment) => void
  onProgress?: (processedMs: number) => void
  onDebug?: (debug: LiveRecognitionDebug) => void
}): Promise<StreamingSession> {
  const platformDir = currentSherpaPlatformDir()
  ensureSherpaPlatformDir(platformDir)
  const forkOpts: ForkOpts = {
    platformDir,
    modelDir: opts.modelDir,
    vadModelPath: opts.vadModelPath,
    recordingId: opts.recordingId,
    language: opts.language,
    speaker: opts.speaker,
  }

  let child = await forkAndInit(forkOpts, { segCounterOffset: 0, sampleOffset: 0 })

  // 续接水位:从已收到的 confirmed 段推导(end×16k = 累计样本;seg-N+1 = 下一段号)。
  let wmSamples = 0 // 最后一个 confirmed 段的 end(样本),= 安全重放起点
  let nextSegNum = 0 // 下一个 worker 应使用的段号
  // PCM 环形缓冲:只留水位之后的块(覆盖 in-flight 段 + 回收延迟),用于 refork 后精确重放。
  let ring: { startSample: number; data: Int16Array }[] = []
  let pushedSamples = 0 // 累计推入样本数(环形缓冲的绝对时间轴)
  let ready = true // 新 worker refork 期间为 false:pushPcm 只入环、不直送
  let stopped = false
  let recyclePromise: Promise<void> | null = null

  /** 丢弃完全早于水位的块(已 confirmed,不会重放) */
  function trimRing(): void {
    let drop = 0
    while (drop < ring.length) {
      const e = ring[drop]!
      if (e.startSample + e.data.length <= wmSamples) drop++
      else break
    }
    if (drop > 0) ring = ring.slice(drop)
  }

  function attachListeners(c: UtilityProcess): void {
    c.on('message', (raw: StreamingEvent) => {
      if (raw.type === 'segment') {
        if (raw.segment.stability === 'confirmed') {
          const n = parseSegNum(raw.segment.segmentId)
          if (n !== null) {
            wmSamples = Math.round(raw.segment.end * SAMPLE_RATE)
            nextSegNum = n + 1
            trimRing()
          }
        }
        opts.onSegment(raw.segment)
      } else if (raw.type === 'progress') opts.onProgress?.(raw.processedMs)
      else if (raw.type === 'debug') {
        opts.onDebug?.(raw.debug)
        logger.debug('[passA] recognize debug', raw.debug)
      } else if (raw.type === 'recycle-needed') {
        logger.info('[passA] recycle requested', { rssMb: raw.rssMb, wmSamples, nextSegNum })
        void recycle()
      } else if (raw.type === 'error')
        logger.warn('[passA] runtime error', { message: raw.message })
    })
  }
  attachListeners(child)

  /** 在段边界换 worker:kill 旧 → fork 新(带偏移)→ 从水位重放环形缓冲 → 恢复直送。 */
  function recycle(): Promise<void> {
    if (stopped || recyclePromise) return recyclePromise ?? Promise.resolve()
    recyclePromise = (async () => {
      const old = child
      ready = false // 重放完成前,pushPcm 只入环
      old.removeAllListeners('message') // 旧 worker 后续输出一律忽略(避免乱序覆盖新 worker)
      old.kill()
      try {
        const next = await forkAndInit(forkOpts, {
          segCounterOffset: nextSegNum,
          sampleOffset: wmSamples,
        })
        if (stopped) {
          next.kill()
          return
        }
        child = next
        attachListeners(child)
        // 从水位精确重放环形缓冲里 ≥ wmSamples 的样本(含回收期间入环的)。
        for (const e of ring) {
          const from = Math.max(0, wmSamples - e.startSample)
          if (from >= e.data.length) continue
          postPcm(child, opts.recordingId, from === 0 ? e.data : e.data.subarray(from))
        }
        ready = true
        logger.info('[passA] recycled', { sampleOffset: wmSamples, segOffset: nextSegNum })
      } catch (err) {
        logger.error('[passA] recycle failed', { err: String(err) })
        // 回收失败:保底不崩,旧 worker 已 kill → 后续 PCM 入环,等下次? 这里直接放弃实时续接。
      } finally {
        recyclePromise = null
      }
    })()
    return recyclePromise
  }

  return {
    recordingId: opts.recordingId,
    pushPcm(int16: Int16Array): void {
      if (stopped) return
      // 入环(留副本,调用方 buffer 可复用);trim 后只保留水位之后的。
      ring.push({ startSample: pushedSamples, data: int16.slice() })
      pushedSamples += int16.length
      trimRing()
      if (ready) postPcm(child, opts.recordingId, int16)
      // ready=false(refork 中):只入环,refork 完成后统一重放,不丢不重。
    },
    async stop(): Promise<void> {
      if (stopped) return
      stopped = true
      if (recyclePromise) await recyclePromise // 等回收落定,对最终 worker 发 stop
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          logger.warn('[passA] flush timeout, force kill', { recordingId: opts.recordingId })
          resolve()
        }, FLUSH_TIMEOUT_MS)
        const onMsg = (raw: StreamingEvent): void => {
          if (raw.type === 'flushed') {
            clearTimeout(timeout)
            child.removeListener('message', onMsg)
            resolve()
          }
        }
        child.on('message', onMsg)
        const msg: StreamingTask = { type: 'stop', recordingId: opts.recordingId }
        child.postMessage(msg)
      })
      child.kill()
    },
  }
}
