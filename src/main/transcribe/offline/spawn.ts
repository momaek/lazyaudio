import path from 'node:path'
import { utilityProcess, type UtilityProcess } from 'electron'
import { logger } from '../../logger'
import { currentSherpaPlatformDir, ensureSherpaPlatformDir } from './loader'
import type { AsrUtilityMessage } from '@shared/transcribe/asr-protocol'

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
