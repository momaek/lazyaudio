// T34 — fork Pass A streaming utility + init 握手,返回会话句柄(pushPcm / stop)。
// 镜像 offline/spawn.ts;stop 发 stop 消息、等 flushed(≤5s 强杀),保证 Pass A 退出后再 fork Pass B。

import path from 'node:path'
import { utilityProcess } from 'electron'
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

export interface StreamingSession {
  readonly recordingId: string
  pushPcm(int16: Int16Array): void
  /** 发 stop → 等 flushed(≤5s 强杀)→ kill。resolve 即 Pass A 已退出。 */
  stop(): Promise<void>
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

  // 持久监听:段 / 进度 / debug / 错误(ready/fatal 由下面 init 握手单独处理)
  child.on('message', (raw: StreamingEvent) => {
    if (raw.type === 'segment') opts.onSegment(raw.segment)
    else if (raw.type === 'progress') opts.onProgress?.(raw.processedMs)
    else if (raw.type === 'debug') {
      opts.onDebug?.(raw.debug)
      logger.debug('[passA] recognize debug', raw.debug)
    } else if (raw.type === 'error') logger.warn('[passA] runtime error', { message: raw.message })
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
      platformDir,
      modelDir: opts.modelDir,
      vadModelPath: opts.vadModelPath,
      recordingId: opts.recordingId,
      language: opts.language,
      speaker: opts.speaker,
    }
    child.postMessage(init)
  })

  let stopped = false
  return {
    recordingId: opts.recordingId,
    pushPcm(int16: Int16Array): void {
      if (stopped) return
      // utilityProcess.postMessage 只能 transfer MessagePortMain,ArrayBuffer 走结构化克隆;
      // 16k mono 100ms 块仅 ~3KB,拷贝开销可忽略。
      const msg: StreamingTask = {
        type: 'pcm',
        recordingId: opts.recordingId,
        pcm: int16.buffer as ArrayBuffer,
      }
      child.postMessage(msg)
    },
    async stop(): Promise<void> {
      if (stopped) return
      stopped = true
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
