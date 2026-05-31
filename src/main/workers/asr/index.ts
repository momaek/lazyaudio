// ASR utility process 入口(ADR-0003:ASR 跑 utility process)。
//
// 输出 out/main/asr.js 由 electron-vite 编译为 CommonJS(main 进程 format=cjs),sherpa-onnx-node
// 被 externalizeDepsPlugin 保留为运行时 require —— 与 CJS N-API addon 的加载链兼容,避免 ESM
// dual-package 陷阱(transcription-pipeline §3.2.1)。源用 .ts(vite 原生处理),CJS 性质由输出保证。
// 此目录由 tsconfig.worker.json 独占(node config 已 exclude src/main/workers/**)。
//
// macOS 加载守卫:SIP 在启动 utility helper 时剥掉所有 DYLD_*(与主进程 helper 同等保护级),
// 主进程改环境变量帮不上 utility —— 真正的 dlopen 守卫必须在 utility 自己进程里:
//   1. platformDir 由主进程 fork 后通过 init 消息传入(不靠 __dirname 反推)
//   2. 校验 platformDir 内 .node + 平台二进制齐全
//   3. require('sherpa-onnx-node') —— dyld 按 LC_LOAD_DYLIB 递归加载整条 .dylib 链
//      (libsherpa-onnx-c-api → libonnxruntime ...),靠 @loader_path 在 .node 同目录解析。
//      前提:afterPack 已用 install_name_tool 把 install_name(-id)+ 依赖(-change)改写成
//      @loader_path/...(scripts/after-pack.cjs)。require 成功即证明整条链可达。
//
// fatal 时**不** process.exit:postMessage 后立即 exit 有丢消息竞态,改为发完 fatal 等主进程 kill。

import fs from 'node:fs'
import type {
  AsrRequestMessage,
  AsrTranscribeMessage,
  AsrUtilityMessage,
} from '@shared/transcribe/asr-protocol'
import { loadRecognizer, recognizeSamples, readWav16kMono, type SherpaModule } from './recognize'

const parentPort = process.parentPort

function post(msg: AsrUtilityMessage): void {
  parentPort.postMessage(msg)
}

// require('sherpa-onnx-node') 成功后缓存模块引用(init 之后才有)
let sherpa: SherpaModule | null = null

function handleInit(platformDir: string): void {
  // darwin / win:验证平台二进制与 .node 同目录可达(Linux 不在 v0.1 范围,跳过文件校验直接 require)
  if (process.platform === 'darwin' || process.platform === 'win32') {
    let files: string[]
    try {
      files = fs.readdirSync(platformDir)
    } catch (err) {
      post({
        type: 'fatal',
        code: 'sherpa-dylib-missing',
        detail: { platformDir, err: String(err) },
      })
      return
    }
    const hasNode = files.some((f) => f.endsWith('.node'))
    const hasLib =
      process.platform === 'darwin'
        ? files.some((f) => f.endsWith('.dylib'))
        : files.some((f) => f.endsWith('.dll'))
    if (!hasNode || !hasLib) {
      post({ type: 'fatal', code: 'sherpa-dylib-missing', detail: { platformDir, files } })
      return
    }
  }

  // 显式注入平台目录,供 sherpa-onnx-node 入口胶水解析平台子包
  process.env['SHERPA_ONNX_INSTALL_DIR'] = platformDir

  try {
    // 必须惰性 require(在守卫之后):静态 import 会在模块顶层就触发加载,绕过上面的 dylib 校验。
    // sherpa-onnx-node 无类型声明。
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('sherpa-onnx-node') as { version?: unknown } & SherpaModule
    sherpa = mod
    const sherpaVersion = typeof mod.version === 'string' ? mod.version : 'unknown'
    post({ type: 'ready', sherpaVersion })
  } catch (err) {
    post({ type: 'fatal', code: 'sherpa-require-failed', detail: String(err) })
  }
}

function handleTranscribe(msg: AsrTranscribeMessage): void {
  const { recordingId, wavPath, modelDir, language, speaker } = msg
  if (!sherpa) {
    post({
      type: 'transcribe-error',
      recordingId,
      code: 'model-load-failed',
      message: 'sherpa not initialized',
    })
    return
  }
  const startedAt = Date.now()

  let rec
  try {
    rec = loadRecognizer(sherpa, modelDir, language)
  } catch (err) {
    post({ type: 'transcribe-error', recordingId, code: 'model-load-failed', message: String(err) })
    return
  }

  let samples: Float32Array
  try {
    samples = readWav16kMono(wavPath).samples
  } catch (err) {
    post({ type: 'transcribe-error', recordingId, code: 'wav-read-failed', message: String(err) })
    return
  }

  try {
    const segments = recognizeSamples(rec, samples, (processedSec, totalSec) => {
      post({ type: 'transcribe-progress', recordingId, processedSec, totalSec })
    })
    post({
      type: 'transcribe-result',
      recordingId,
      segments,
      language,
      speaker,
      durationMs: Date.now() - startedAt,
    })
  } catch (err) {
    post({ type: 'transcribe-error', recordingId, code: 'recognize-failed', message: String(err) })
  }
}

parentPort.on('message', (event) => {
  const msg = event.data as AsrRequestMessage | undefined
  if (!msg) return
  if (msg.type === 'init') {
    handleInit(msg.platformDir)
  } else if (msg.type === 'transcribe') {
    handleTranscribe(msg)
  } else {
    post({ type: 'fatal', code: 'protocol-error' })
  }
})
