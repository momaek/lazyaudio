// T34 — Pass A 实时转录 utility 入口(ADR-0003 同 ASR utility 套路)。
// 输出 out/main/streaming-asr.js(CJS)。加载链守卫与 workers/asr/index.ts 同理:
// init 时校验 platformDir 的 .node + 平台二进制,再惰性 require('sherpa-onnx-node')。

import fs from 'node:fs'
import type { StreamingTask, StreamingEvent } from '@shared/transcribe/streaming-protocol'
import { loadRecognizer, type SherpaModule } from '../asr/recognize'
import { VadStream, type VadInstance } from './vad-stream'
import { createPassAMetrics } from './passa-metrics'

const parentPort = process.parentPort

function post(msg: StreamingEvent): void {
  parentPort.postMessage(msg)
}

interface StreamingSherpa extends SherpaModule {
  version?: unknown
  Vad: new (config: unknown, bufferSizeInSeconds: number) => VadInstance
}

let stream: VadStream | null = null
let currentRecordingId = ''
let recycleRequested = false

// T61 OfflineStream 泄漏:sherpa stream 无 free,长录音原生内存只增不减(见 tech-feasibility)。
// 单次录音中途按 RSS 阈值请 main 在段边界换 worker(进程退出是唯一回收路径)。
const RSS_LIMIT_MB = Number(process.env['LAZY_PASSA_RSS_LIMIT_MB']) || 1500

// 段边界(confirmed 刚落定,VadStream curBuf 已空)是安全换点:此刻无 in-flight 段需交接。
function maybeRequestRecycle(): void {
  if (recycleRequested) return
  const rssMb = process.memoryUsage().rss / 1024 / 1024
  if (rssMb < RSS_LIMIT_MB) return
  recycleRequested = true
  post({ type: 'recycle-needed', recordingId: currentRecordingId, rssMb: Math.round(rssMb) })
}

function dylibGuardFails(platformDir: string): boolean {
  if (process.platform !== 'darwin' && process.platform !== 'win32') return false
  let files: string[]
  try {
    files = fs.readdirSync(platformDir)
  } catch (err) {
    post({ type: 'fatal', code: 'sherpa-dylib-missing', detail: { platformDir, err: String(err) } })
    return true
  }
  const hasNode = files.some((f) => f.endsWith('.node'))
  const hasLib =
    process.platform === 'darwin'
      ? files.some((f) => f.endsWith('.dylib'))
      : files.some((f) => f.endsWith('.dll'))
  if (!hasNode || !hasLib) {
    post({ type: 'fatal', code: 'sherpa-dylib-missing', detail: { platformDir, files } })
    return true
  }
  return false
}

function handleInit(msg: Extract<StreamingTask, { type: 'init' }>): void {
  if (dylibGuardFails(msg.platformDir)) return
  process.env['SHERPA_ONNX_INSTALL_DIR'] = msg.platformDir

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sherpa = require('sherpa-onnx-node') as StreamingSherpa
    const rec = loadRecognizer(sherpa, msg.modelDir, msg.language)
    const vad = new sherpa.Vad(
      {
        sileroVad: {
          model: msg.vadModelPath,
          threshold: 0.5,
          minSilenceDuration: 0.4,
          minSpeechDuration: 0.25,
          maxSpeechDuration: 30,
          windowSize: 512,
        },
        sampleRate: 16000,
        numThreads: 1,
        provider: 'cpu',
        debug: false,
      },
      60,
    )
    currentRecordingId = msg.recordingId
    recycleRequested = false
    stream = new VadStream(
      rec,
      vad,
      msg.speaker,
      (segment) => {
        post({ type: 'segment', recordingId: currentRecordingId, segment })
        // confirmed = 段边界,curBuf 已空 → 安全换点。main 从该 confirmed 段推水位续接。
        if (segment.stability === 'confirmed') maybeRequestRecycle()
      },
      (processedMs) => post({ type: 'progress', recordingId: currentRecordingId, processedMs }),
      createPassAMetrics(),
      {},
      (debug) => post({ type: 'debug', recordingId: currentRecordingId, debug }),
      { sampleOffset: msg.sampleOffset, segCounterOffset: msg.segCounterOffset },
    )
    post({
      type: 'ready',
      sherpaVersion: typeof sherpa.version === 'string' ? sherpa.version : 'unknown',
    })
  } catch (err) {
    post({ type: 'fatal', code: 'sherpa-require-failed', detail: String(err) })
  }
}

parentPort.on('message', (event) => {
  const msg = event.data as StreamingTask | undefined
  if (!msg) return
  if (msg.type === 'init') {
    handleInit(msg)
  } else if (msg.type === 'pcm') {
    if (!stream) return
    try {
      stream.pushInt16(new Int16Array(msg.pcm))
    } catch (err) {
      post({ type: 'error', recordingId: currentRecordingId, message: String(err) })
    }
  } else if (msg.type === 'stop') {
    try {
      stream?.flush()
    } catch (err) {
      post({ type: 'error', recordingId: currentRecordingId, message: String(err) })
    }
    post({ type: 'flushed', recordingId: currentRecordingId })
    // main 收到 flushed 后会 kill 本进程(释放模型内存,Pass A→B 串行)
  }
})
