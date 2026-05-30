import path from 'node:path'
import { utilityProcess, type UtilityProcess } from 'electron'
import { logger } from '../../logger'
import { currentSherpaPlatformDir, ensureSherpaPlatformDir } from './loader'
import type {
  AsrSegment,
  AsrTranscribeMessage,
  AsrUtilityMessage,
} from '@shared/transcribe/asr-protocol'

export interface AsrSpawnResult {
  child: UtilityProcess
  sherpaVersion: string
}

const DEFAULT_TIMEOUT_MS = 10_000

/**
 * fork ASR utility process,等它 require('sherpa-onnx-node') 成功(ready)后 resolve。
 * fatal / spawn 超时 / 早退 则 reject(并 kill 子进程)。
 *
 * T30 最小版:只验证加载链通(dev + ad-hoc packaged 都能 require)。真实识别(喂 PCM、
 * 出 transcript)在 T32 基于本骨架扩展。调用方拿到 child 后自行决定保留还是 kill。
 */
export async function spawnAsrUtility(opts: { timeoutMs?: number } = {}): Promise<AsrSpawnResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const platformDir = currentSherpaPlatformDir()
  // 早失败:平台目录 / 二进制缺失就不必 fork(utility 内还会再校验一次)
  ensureSherpaPlatformDir(platformDir)

  // asr.js 与 index.js 同目录(electron.vite.config main 多入口),__dirname = out/main
  const entry = path.join(__dirname, 'asr.js')
  const child = utilityProcess.fork(entry, [], { serviceName: 'lazyaudio-asr' })

  // 必须等 'spawn' 再 postMessage:之前 utility 内 parentPort.once('message') 未注册,消息会被丢
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      child.kill()
      reject(new Error('asr utility spawn timeout'))
    }, timeoutMs)
    child.once('spawn', () => {
      clearTimeout(t)
      resolve()
    })
  })

  return await new Promise<AsrSpawnResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error('asr utility init timeout'))
    }, timeoutMs)

    child.on('message', (raw: AsrUtilityMessage) => {
      if (raw.type === 'ready') {
        clearTimeout(timeout)
        logger.info('[asr] utility ready', { sherpaVersion: raw.sherpaVersion })
        resolve({ child, sherpaVersion: raw.sherpaVersion })
      } else if (raw.type === 'fatal') {
        clearTimeout(timeout)
        child.kill()
        logger.error('[asr] utility fatal', { code: raw.code, detail: raw.detail })
        reject(new Error(`asr utility fatal: ${raw.code}`))
      }
    })

    // 在 ready 之前异常退出(require 没机会发 fatal 等):也 reject
    child.once('exit', (code) => {
      clearTimeout(timeout)
      reject(new Error(`asr utility exited early: code=${code}`))
    })

    child.postMessage({ type: 'init', platformDir })
  })
}

export interface TranscribeRunResult {
  segments: AsrSegment[]
  language: string
  speaker: string
  durationMs: number
}

const TRANSCRIBE_TIMEOUT_MS = 60 * 60_000 // 60min 兜底(30min 录音 RTF~0.1 实际几分钟)

/**
 * 在已 ready 的 utility 上跑一次转录,等 transcribe-result / -error。
 * 进度经 onProgress 外发;超时 / 子进程退出则 reject。
 */
export async function runTranscribe(
  child: UtilityProcess,
  msg: AsrTranscribeMessage,
  opts: { onProgress?: (processedSec: number, totalSec: number) => void; timeoutMs?: number } = {},
): Promise<TranscribeRunResult> {
  const timeoutMs = opts.timeoutMs ?? TRANSCRIBE_TIMEOUT_MS
  return await new Promise<TranscribeRunResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('transcribe timeout'))
    }, timeoutMs)

    const onMessage = (raw: AsrUtilityMessage): void => {
      if (raw.type === 'transcribe-progress' && raw.recordingId === msg.recordingId) {
        opts.onProgress?.(raw.processedSec, raw.totalSec)
      } else if (raw.type === 'transcribe-result' && raw.recordingId === msg.recordingId) {
        cleanup()
        resolve({
          segments: raw.segments,
          language: raw.language,
          speaker: raw.speaker,
          durationMs: raw.durationMs,
        })
      } else if (raw.type === 'transcribe-error' && raw.recordingId === msg.recordingId) {
        cleanup()
        reject(new Error(`${raw.code}: ${raw.message}`))
      }
    }
    const onExit = (code: number): void => {
      cleanup()
      reject(new Error(`asr utility exited during transcribe: code=${code}`))
    }
    function cleanup(): void {
      clearTimeout(timeout)
      child.removeListener('message', onMessage)
      child.removeListener('exit', onExit)
    }

    child.on('message', onMessage)
    child.once('exit', onExit)
    child.postMessage(msg)
  })
}
