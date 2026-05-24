// spike-012a Pass A utility process:
// - sherpa-onnx-node:
//   - Vad (silero-vad, windowSize:512, threshold:0.5, minSpeech:0.25,
//          minSilence:0.5, sampleRate:16000)
//   - OfflineRecognizer (sense-voice int8 2025-09-09, language:'zh',
//                        useInverseTextNormalization:1, numThreads:2)
//   - 模型路径参考 spike-011/src/bench.ts SV_CONFIG / VAD_CONFIG
// - 收 main 'audio' 消息 (mixed mono 16k Float32) -> 累 buffer ->
//   按 windowSize 喂 VAD -> endpoint -> sense-voice 推理
// - 测两路 latency:
//   - asrLatencyMs:sense-voice 推理时间 (用于 RTF)
//   - vadToAsrLatencyMs:segment ready 到 ASR done 的 wall-clock
//
// 父进程 (Electron main) 通过 utilityProcess.fork 启动,IPC 用
// process.parentPort + postMessage / on('message')

const path = require('node:path')
const fs = require('node:fs')

const MODELS_DIR = process.env.MODELS_DIR || path.join(__dirname, '..', 'models')
const SAMPLE_RATE = Number(process.env.SAMPLE_RATE || 16000)

function send(msg) {
  process.parentPort.postMessage(msg)
}

function fatal(err) {
  send({ type: 'pass-a:error', error: String(err && err.stack ? err.stack : err) })
  process.exit(1)
}

// ---- load sherpa-onnx-node ----
let sherpa
try {
  sherpa = require('sherpa-onnx-node')
} catch (e) {
  fatal(`require('sherpa-onnx-node') failed: ${e}`)
}

// ---- 模型路径 ----
const SV_DIR = path.join(
  MODELS_DIR,
  'sense-voice',
  'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09',
)
const VAD_MODEL = path.join(MODELS_DIR, 'silero-vad', 'silero_vad.onnx')

// 校验文件存在
for (const p of [
  path.join(SV_DIR, 'model.int8.onnx'),
  path.join(SV_DIR, 'tokens.txt'),
  VAD_MODEL,
]) {
  if (!fs.existsSync(p)) {
    fatal(`model file missing: ${p}\n请先跑 'pnpm models' 下载`)
  }
}

const SV_CONFIG = {
  featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
  modelConfig: {
    senseVoice: {
      model: path.join(SV_DIR, 'model.int8.onnx'),
      useInverseTextNormalization: 1,
      language: 'zh',
    },
    tokens: path.join(SV_DIR, 'tokens.txt'),
    numThreads: 2,
    provider: 'cpu',
    debug: 0,
  },
}

const VAD_WINDOW = 512
const VAD_CONFIG = {
  sileroVad: {
    model: VAD_MODEL,
    threshold: 0.5,
    minSpeechDuration: 0.25,
    minSilenceDuration: 0.5,
    windowSize: VAD_WINDOW,
  },
  sampleRate: SAMPLE_RATE,
  debug: 0,
  numThreads: 1,
}

let recognizer, vad

try {
  console.log('[pass-a] loading sense-voice ...')
  const tLoad0 = Date.now()
  recognizer = new sherpa.OfflineRecognizer(SV_CONFIG)
  console.log(`[pass-a] sense-voice loaded in ${Date.now() - tLoad0}ms`)
  console.log('[pass-a] loading silero-vad ...')
  const tVadLoad0 = Date.now()
  // bufferSizeInSeconds 是 Vad 构造函数第二个参数 (按 sherpa-onnx-node 文档)
  vad = new sherpa.Vad(VAD_CONFIG, 60)
  console.log(`[pass-a] silero-vad loaded in ${Date.now() - tVadLoad0}ms`)
} catch (e) {
  fatal(`model load failed: ${e}`)
}

send({ type: 'pass-a:ready' })

// ---- 音频缓冲 + 段处理 ----
let pendingPCM = new Float32Array(0)
let totalSamplesReceived = 0
let segmentId = 0
const startedAt = Date.now()

function processVadWindow(buf) {
  // 按 VAD_WINDOW 切片喂
  let offset = 0
  while (offset + VAD_WINDOW <= buf.length) {
    const slice = buf.subarray(offset, offset + VAD_WINDOW)
    vad.acceptWaveform(slice)
    offset += VAD_WINDOW

    while (!vad.isEmpty()) {
      const segment = vad.front()
      vad.pop()
      const segReadyT = Date.now()
      const startMs = Math.round((segment.start / SAMPLE_RATE) * 1000)
      const lenMs = Math.round((segment.samples.length / SAMPLE_RATE) * 1000)
      // 跑 ASR
      const asrT0 = Date.now()
      let text = ''
      try {
        const stream = recognizer.createStream()
        stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples: segment.samples })
        recognizer.decode(stream)
        const r = recognizer.getResult(stream)
        text = typeof r === 'string' ? r : (r.text ?? '')
        stream.free?.()
      } catch (e) {
        console.error('[pass-a] ASR failed:', e)
      }
      const asrDoneT = Date.now()
      segmentId++
      send({
        type: 'pass-a:segment',
        segmentId,
        startMs,
        endMs: startMs + lenMs,
        durationMs: lenMs,
        text,
        asrLatencyMs: asrDoneT - asrT0,
        vadToAsrLatencyMs: asrDoneT - segReadyT,
        // 反算:从 utility 开始到 segment 完成的 wall-clock,辅助 leak / 飘移定位
        utilityElapsedMs: asrDoneT - startedAt,
      })
    }
  }
  return offset
}

process.parentPort.on('message', (msgEvent) => {
  // utilityProcess 的 message event 是 { data: ... }
  const msg = msgEvent && 'data' in msgEvent ? msgEvent.data : msgEvent
  if (!msg || typeof msg !== 'object') return
  if (msg.type === 'audio') {
    const pcm = msg.pcm instanceof Float32Array ? msg.pcm : new Float32Array(msg.pcm)
    totalSamplesReceived += pcm.length
    // 拼到 pending
    const newBuf = new Float32Array(pendingPCM.length + pcm.length)
    newBuf.set(pendingPCM, 0)
    newBuf.set(pcm, pendingPCM.length)
    // 跑 VAD windows
    const consumed = processVadWindow(newBuf)
    pendingPCM = newBuf.subarray(consumed)
    // 防止 pending 无限增长 (理论上 VAD_WINDOW=512 始终能消耗大部分)
    if (pendingPCM.length > VAD_WINDOW * 8) {
      pendingPCM = pendingPCM.subarray(pendingPCM.length - VAD_WINDOW * 8)
    }
  } else if (msg.type === 'shutdown') {
    console.log(
      `[pass-a] shutdown; totalSamples=${totalSamplesReceived} segments=${segmentId} elapsedMs=${Date.now() - startedAt}`,
    )
    try {
      vad?.flush?.()
      vad?.reset?.()
    } catch {}
    process.exit(0)
  }
})

// 兜底:每 10s 打一行存活
setInterval(() => {
  console.log(
    `[pass-a] alive elapsedSec=${((Date.now() - startedAt) / 1000).toFixed(0)} samples=${totalSamplesReceived} segments=${segmentId} pendingPCM=${pendingPCM.length}`,
  )
}, 10000)
