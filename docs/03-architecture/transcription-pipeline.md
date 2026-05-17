# 转录与摘要管线

> **版本**：v0.1-draft
> **日期**：2026-05-16
> **状态**：03-architecture 阶段；与 [`overview.md`](./overview.md) §2.1 / §4.1 / [`data-model.md`](./data-model.md) §4 §6 §7 衔接
> **依赖**：[`../01-research/sherpa-onnx-research.md`](../01-research/sherpa-onnx-research.md) 已结论；spike-003 / 004 已通过

---

## 0. 这份文档解决什么

把"录完音的 wav 怎么变成 transcript.json，再变成 summary.md"这段管线说清楚：

- 本地（sherpa-onnx）/ 云端（OpenAI 兼容 API）两条引擎的统一抽象
- 模型下载、校验、镜像 fallback
- VAD → ASR → 标点 / ITN 的处理顺序
- 任务队列、取消、重试、并发
- LLM 摘要：模板套用、变量替换、流式 / 一次性
- macOS SIP + sherpa-onnx 加载坑

**不解决**：transcript.json / summary.md / 模板 JSON 的字段（在 [`data-model.md`](./data-model.md) §4 / §6）、IPC 消息字段（在 [`ipc-contract.md`](./ipc-contract.md)）、WAV 文件格式（在 [`audio-capture.md`](./audio-capture.md)）。

---

## 1. 设计目标速查

| 目标 | 来源 | 落地手段 |
|---|---|---|
| 本地优先 | PRD §3.1 | 默认 `privacyMode='local'`，sherpa-onnx 在 utility process |
| 用户可切云端 | PRD §4 / §8 | 同一 EngineFacade 抽象，cloud adapter 走 OpenAI 兼容 API |
| 转录不阻塞 UI、不拖垮 app | PRD §5.2 / §7.1 | utility process + cancellable task |
| RTF ≤ 0.1（SenseVoice int8） | PRD §7.1 | sherpa-onnx 默认配置 + numThreads=2 |
| 模型按需下载 < 5min | PRD §1.3 / §5.1 | 镜像 fallback + 断点续传 + SHA256 |
| LLM 摘要按会话类型自动套模板 | PRD §4.2 F7.1 | recording 完成 → 查 sessionType → 套对应内置模板 |
| 任一子任务失败不阻塞其它 | data-model §2.1 四套子状态 | 转录失败 → meta.transcribe.status=failed，摘要不触发；摘要失败不影响转录结果 |

---

## 2. 引擎抽象（Multi Pass）

v0.1 PRD F4.6–F4.9 把实时转录纳入 P0，引擎抽象拆成两条接口——**Pass A（streaming，录音中）** 与 **Pass B（offline，录音结束后）** 独立 facade，但走同一 `EngineRegistry` 工厂。

### 2.1 StreamingEngine（Pass A）

录音中接 PCM 流，输出 hypothesis / confirmed 段落。

```ts
// electron/main/transcribe/StreamingEngine.ts
interface StreamingEngine {
  readonly kind: 'local-streaming-zipformer' | 'local-vad-shortwin' | 'cloud-openai-stream'

  // 启动一次实时转录会话——返回 controller，上层 push PCM、收事件、stop
  start(input: StreamInput): StreamingSession

  ping(): Promise<{ ok: boolean, latencyMs?: number, error?: string }>
}

type StreamInput = {
  recordingId: string
  sampleRate: 16000                 // 上层负责下采样 48k→16k 再 push
  channels: 1                       // 上层 mono mix
  language?: 'auto' | 'zh' | 'en' | string
}

interface StreamingSession {
  pushPcm(int16: Int16Array): void              // 主进程从录音 PCM fork 喂入
  onEvent(cb: (e: LiveEvent) => void): void
  stop(): Promise<void>                         // 录音 stop 时调；engine 内部 flush + unload model
}

type LiveEvent =
  | {
      type: 'segment'
      segmentId: string                         // 稳定 id，hypothesis → confirmed 同 id
      start: number                             // 秒
      end: number
      text: string
      speaker: string                           // 由上层根据 PCM 来源贴标（mic/system）
      stability: 'hypothesis' | 'confirmed'
    }
  | { type: 'progress', processedMs: number }
  | { type: 'failed', code: string, message: string }
```

**segmentId 稳定性约束**（spike-013 验证）：同一逻辑段在 hypothesis → confirmed 全程 id 不变；UI 据此原地替换、不跳行。

### 2.2 OfflineEngine（Pass B）

录音结束后接完整 WAV，输出最终 segments；与 v0.1 r1-r4 单 pass 设计一致。

```ts
// electron/main/transcribe/OfflineEngine.ts
interface OfflineEngine {
  readonly kind: 'local-sense-voice' | 'openai-compatible'

  // 一次性转录：吃 wav 路径，吐分段
  transcribe(
    input: TranscribeInput,
    onEvent?: (e: TranscribeEvent) => void,
    signal?: AbortSignal,
  ): Promise<TranscribeResult>

  // 健康检查（用于 onboarding / 设置页"测试连接"）
  ping(): Promise<{ ok: boolean, latencyMs?: number, error?: string }>
}

type TranscribeInput = {
  recordingId: string
  audioFiles: {
    mic?: string                  // 绝对路径
    system?: string
    mixed?: string                // 仅当 mic/system 都关分轨时用
  }
  language?: 'auto' | 'zh' | 'en' | string
  timeRange?: { startSec: number, endSec: number }   // 增量 Pass B：仅转 [start, end] 段（F4.8）
}

type TranscribeEvent =
  | {
      type: 'progress'
      phase: 'loading-model' | 'vad' | 'asr' | 'punct' | 'merging' | 'uploading' | 'waiting-api'
      processedMs?: number        // 已处理的音频毫秒数；renderer 自己除以 total 算 pct
    }
  | {
      type: 'partial-segment'     // v0.1 不发；v0.2 流式转录 / 边录边转时启用
      segment: TranscriptSegment  // 单段已识别结果，UI 实时追加
    }

type TranscribeResult = {
  segments: TranscriptSegment[]   // 见 data-model §4.1
  engine: string
  modelKey?: string
  language: string
  durationMs: number              // 转录耗时
}
```

### 2.3 TranscribeOrchestrator（Multi Pass 状态机）

主进程持有的协调器，跨录音生命周期管 Pass A / B：

```
record:start
  → 选 StreamingEngine（spike-011 拍板后默认；云端模式默认禁用，用户主动开则用 cloud-openai-stream）
  → fork Pass A utility（streaming-utility-process）
  → engine.start(input) → session
  → main 从 audio-capture 的 PCM fork port 接 PCM → session.pushPcm()
  → session.onEvent →
      'segment' → 增量写 transcript.live.json + ipc: 'transcribe:live-segment' to renderer
      'progress' → ipc: 'transcribe:live-progress'

录音中每 10/20/30… 分钟（meta.durationMs 触发）
  → 检测内存 > 6GB & 用户未关 banner
    → 发 ipc: 'transcribe:partial-offline-suggest' to renderer
    → renderer 显示 banner
    → 用户点"跑离线" → invoke 'transcribe:run-partial-offline' { recordingId, endSec }
      → fork second offline utility（**不** unload Pass A）
      → engine.transcribe({ timeRange: [0, endSec] })
      → 完成后用 segments 覆盖 transcript.live.json 中 [0, endSec] 范围（保留 (endSec, now] 的 Pass A 内容）

record:stop
  → 关 writers + 生成 mixed.wav
  → session.stop() → Pass A utility 收尾 + 自杀（释放 ~1GB）
  → await pass-A-exited (max 5s，超时强杀)
  → fork Pass B utility
  → engine.transcribe(input)
    ├─ onEvent → ipc: 'transcribe:progress'
    └─ result → 写 transcript.json（覆盖式，与 transcript.live.json 并存）
                 + meta.transcribe.status=done
                 + ipc: 'transcribe:offline-overwrite' to renderer
                   （renderer 用新 segments 整体刷新视图，不弹通知）
  → if settings.autoSummaryAfterTranscribe && cloudLLM 已配置:
      → summarizer.run(transcript.json)   # 摘要总是用 Pass B 结果
```

**Pass A unload 与 Pass B fork 串行**——是 PRD §7.1 内存上限 2.5GB 的硬约束：两份 sherpa 模型同时驻留 ≈ 2GB，加录音 + UI 会爆。中途增量 Pass B 是例外（需 > 6GB 内存检测后才允许）。

### 2.4 为什么走"工厂 + 单例"

- 同一时刻只有一个本地 engine 实例（模型加载 ~1 GB 内存，复用）
- 云端 engine 是无状态 HTTP client，单例只是省构造成本
- 切换隐私模式时：destroy 旧 engine → 构造新 engine；正在跑的任务收到 AbortSignal 取消

```ts
class EngineRegistry {
  private current?: TranscribeEngine
  get(): TranscribeEngine {
    if (!this.current) this.current = this.build()
    return this.current
  }
  rebuild() {
    this.current?.dispose?.()
    this.current = this.build()
  }
  /**
   * 启动后 / 设置切换后调用：dry-run 一次 ping，让"本地引擎启动就失败"
   * 这类问题在用户按下录音键之前就暴露
   */
  async ensureReady(): Promise<{ ok: true } | { ok: false, reason: string }> {
    const result = await this.get().ping()
    if (result.ok) return { ok: true }
    return { ok: false, reason: result.error ?? 'unknown' }
  }
  private build(): TranscribeEngine {
    if (settings.privacyMode === 'cloud' && settings.cloudTranscribe?.enabled) {
      return new OpenAICompatibleEngine(...)
    }
    return new LocalSenseVoiceEngine(...)
  }
}
```

**`ensureReady()` 触发点**：

| 触发 | 失败行为 |
|---|---|
| onboarding 完成后 | "本地引擎不可用：[切到云端] [尝试修复] [查看日志]" |
| app 启动后（settings 已存在） | 顶部 toast "本地引擎不可用，点击查看"；不阻塞录音功能（录音可以照常，只是转录跑不了） |
| 用户在设置切换 privacyMode 后 | inline 提示 "切换后引擎连不通，确认仍切换？" |
| 用户主动点 "测试连接" | UI 即时显示 ok / 失败原因 |

避免出现"用户已完成 onboarding、录了 1 小时音、最后才发现转录跑不了"的破坏性 UX。

---

## 3. 本地引擎：sherpa-onnx in Utility Process

### 3.1 进程拓扑回顾

```
Main Process                          Utility Process (asr-worker.js)
─────────────                         ───────────────────────────────
TranscribeOrchestrator                 require('sherpa-onnx')   <-- N-API addon
  │                                    OfflineRecognizer (单例)
  │  utilityProcess.postMessage        VoiceActivityDetector (单例)
  │  { taskId, audioPath, lang }       │
  ├─────────────────────────────────►  │
  │                                    │  while (frames):
  │                                    │    VAD → speech segments
  │                                    │    for each segment:
  │                                    │      OfflineRecognizer.decode
  │                                    │      post { taskId, progress }
  │  { taskId, progress }              │
  │ ◄─────────────────────────────────│
  │                                    │  post { taskId, result }
  │ ◄─────────────────────────────────┤
  │ 写 transcript.json
```

详见 [`overview.md`](./overview.md) §2 / [`ipc-contract.md`](./ipc-contract.md) §3。

### 3.2 macOS SIP / @loader_path 加载链

`sherpa-onnx-research.md` §5 已经详细写过；这里给**主进程启动时的具体动作**：

```ts
// electron/main/transcribe/local/loader.ts
async function sherpaPlatformBaseDir(): Promise<string> {
  // dev: node_modules 在源码树
  // packaged: app.asar.unpacked/node_modules
  const root = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked')
    : app.getAppPath()
  return path.join(
    root,
    'node_modules',
    `sherpa-onnx-${process.platform}-${process.arch}`,
  )
}

async function ensureSherpaLoadableInMain(): Promise<void> {
  // 主进程层只做"早失败提示"——真正 require('sherpa-onnx') 在 utility process
  // 详见 §3.2.1
  const baseDir = await sherpaPlatformBaseDir()
  if (!fsSync.existsSync(baseDir)) {
    throw new Error(`sherpa-onnx platform package missing: ${baseDir}`)
  }
  if (process.platform === 'darwin') {
    const files = await fs.readdir(baseDir)
    if (!files.some(f => f.endsWith('.dylib'))) {
      throw new Error('sherpa-onnx dylibs not found in expected dir')
    }
  }
}
```

> **关键**：这里只是**早失败提示**，不能让主进程的检查替 utility process 做真实加载。主进程过了不代表 utility process 能 require 成功——SIP / DYLD_* 剥离对 utility helper 一样生效。**真正的 dlopen 守卫在 utility 自己的入口**，见 §3.2.1。

### 3.2.1 Utility process 自己的加载守卫

Electron utility process 是受 SIP 保护的 helper 二进制（与主进程 helper 同等保护级别），`DYLD_LIBRARY_PATH` / `DYLD_FALLBACK_LIBRARY_PATH` 在 utility 启动时**同样被剥**。主进程的环境变量赋值帮不上 utility——必须由 utility 入口自己解决。

```ts
// electron/main/workers/asr/index.ts —— utility process 入口
// 注：utility 入口编译为 CommonJS（worker 自身 package.json type=commonjs 或 .cjs 后缀），
//     与 sherpa-onnx-node (CJS) 的 require() 加载链兼容；用 ESM 会触发 dual-package 陷阱
// 必须在 require('sherpa-onnx') 之前执行

import path from 'node:path'
import fs from 'node:fs'

// platformDir 由主进程在 fork 时通过 init 消息传入，**不**靠 __dirname 反推。
// 理由：utility 中 app 模块不可用；__dirname + '..'.repeat(N) 强依赖源码目录结构，重构即断。
// 由主进程统一用 app.isPackaged + process.resourcesPath 算好再传，唯一真相源在 main。
let platformDir: string | null = null

process.parentPort.once('message', (msg) => {
  if (msg.type !== 'init') {
    process.exit(2)                                     // 协议错，第一条必须是 init
  }
  platformDir = msg.platformDir

  // macOS: 验证 dylib 与 .node 同目录可达
  // 解决方案不是设 DYLD_*（没用），而是依赖 electron-builder asarUnpack 把 .node + .dylib 一起放在 platformDir
  // 让 dyld 通过 @loader_path 直接找到——前提：构建时必须用 install_name_tool 同时改写
  //   - 自身 install_name (-id) 
  //   - 对其它 dylib 的 LC_LOAD_DYLIB (-change)
  // 详见后文 afterPack hook
  if (process.platform === 'darwin') {
    const files = fs.readdirSync(platformDir)
    const hasDylib = files.some(f => f.endsWith('.dylib'))
    const hasNode  = files.some(f => f.endsWith('.node'))
    if (!hasDylib || !hasNode) {
      process.parentPort.postMessage({
        type: 'fatal',
        code: 'sherpa-dylib-missing',
        detail: { platformDir, files },
      })
      process.exit(1)
    }
  }
  // Windows: dll 与 .node 同目录，Windows 加载器走 PATH 邻近搜索，无 SIP 等价问题
  // Linux: 不在 v0.1 范围

  // 真正的 require —— 上面任何一步失败都已经 exit
  initASR(platformDir)
})

function initASR(platformDir: string) {
  // 把 platformDir 显式注入到 sherpa-onnx 的入口胶水
  process.env.SHERPA_ONNX_INSTALL_DIR = platformDir
  const sherpa = require('sherpa-onnx')
  // ... ensureRecognizer / 消息循环
}
```

**主进程 fork 时**：

```ts
// electron/main/transcribe/local/spawn.ts
const child = utilityProcess.fork(path.join(__dirname, '../workers/asr/index.js'), [], { ... })

// **必须等 'spawn' 事件**——在此之前 utility 内的 parentPort.once('message') listener 未注册，
// postMessage 会被丢弃，表现为 utility 启动后卡死等 init。
await new Promise<void>(resolve => child.once('spawn', () => resolve()))

const root = app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar.unpacked')
  : app.getAppPath()
const platformDir = path.join(root, 'node_modules', `sherpa-onnx-${process.platform}-${process.arch}`)
child.postMessage({ type: 'init', platformDir })
```

**构建后处理（macOS）**：electron-builder asarUnpack 把文件解到正确位置，但**还需要一步** `install_name_tool` 把每个 `.dylib` 的 install_name + 相互依赖的 LC_LOAD_DYLIB 改写成 `@loader_path/...`，让 dyld 通过 .node 所在目录找到 dylib。这一步在 `afterPack` hook 里跑：

```js
// electron-builder.yml afterPack hook
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

exports.default = async ({ appOutDir, electronPlatformName, arch }) => {
  if (electronPlatformName !== 'darwin') return
  const dylibDir = path.join(
    appOutDir,
    'LazyAudio.app/Contents/Resources/app.asar.unpacked/node_modules',
    `sherpa-onnx-darwin-${arch}`,
  )
  const files = fs.readdirSync(dylibDir).filter(f => f.endsWith('.dylib') || f.endsWith('.node'))

  for (const f of files) {
    const filePath = path.join(dylibDir, f)

    // 1. 改 dylib 自己的 install_name（仅 .dylib，.node 不需要）
    if (f.endsWith('.dylib')) {
      execFileSync('install_name_tool', ['-id', `@loader_path/${f}`, filePath])
    }

    // 2. 改对其它 dylib 的 LC_LOAD_DYLIB 依赖路径——关键步骤，漏了会运行时报"依赖找不到"
    //    sherpa-onnx 的 dylib 互相依赖（libonnxruntime → libonnxruntime_providers_shared 等）
    const otoolOut = execFileSync('otool', ['-L', filePath]).toString()
    const lines = otoolOut.split('\n').slice(1)         // 跳过首行 "<filePath>:"
    for (const line of lines) {
      const oldPath = line.trim().split(/\s+/)[0]
      if (!oldPath) continue
      if (oldPath === filePath) continue                // 自身 install_name，已 -id 处理
      // 仅改写"指向本目录内 dylib"的依赖；系统库（/usr/lib/* /System/*）保持原样
      const baseName = path.basename(oldPath)
      if (files.includes(baseName) && !oldPath.startsWith('@loader_path')) {
        execFileSync('install_name_tool', [
          '-change', oldPath, `@loader_path/${baseName}`, filePath,
        ])
      }
    }

    // 3. install_name_tool 改完之后**必须重签**——任何 Mach-O header 改动都会让原签名失效，
    //    不重签 → 公证 100% 失败（"resource fork, Finder information, or similar detritus not allowed"
    //    或 "code object is not signed"）
    execFileSync('codesign', [
      '--force', '--sign', process.env.APPLE_IDENTITY,
      '--options', 'runtime',
      '--entitlements', entitlementsPath,           // 含 allow-unsigned-executable-memory / allow-jit
      '--timestamp',
      filePath,
    ])
  }

  // 4. dylib / .node 全部重签后，外层 .app bundle 也要重签一次（电子化常用 electron-builder 自动接管）
  //    顺序敏感：先内层 → 后外层；先 dylib → 后 .node → 后 app
  //    详细签名配置见 ADR-0002（待写）
}
```

**漏 LC_LOAD_DYLIB 改写**：app 启动时主 dylib (`libsherpa-onnx-core.dylib`) 加载成功，但当 Recognizer 第一次推理时 dyld 找不到 `libonnxruntime.dylib`——错误栈非常深，比"主 dylib 加载失败"难诊断。

**漏 codesign 重签**：本地 dev 看起来一切正常（ad-hoc 签名容忍 Mach-O 修改），但公证一定挂——`stapler` 报 "code object is not signed at all" 或公证服务 reject 整包。**install_name_tool 与 codesign 必须配对**。

这两个坑都**必须在 ADR-0002 落到位**。

详细签名 + 公证流程进 ADR-0002（待写）。

**关键约束**：
- electron-builder 配置必须显式 `asarUnpack: ['node_modules/sherpa-onnx/**', 'node_modules/sherpa-onnx-darwin-*/**', 'node_modules/sherpa-onnx-win32-*/**']`
- macOS hardened runtime entitlements 必须含 `com.apple.security.cs.allow-unsigned-executable-memory` 和 `allow-jit`，否则 onnxruntime 加载即崩
- CI 必须做 **签名 + 公证后启动** smoke test，仅 dev 验证不算数

详见后续 ADR（overview §8 #1 / #2）。

### 3.3 Recognizer 与 VAD 初始化

```ts
// electron/main/workers/asr/index.ts (utility process entry)
const sherpa = require('sherpa-onnx')
const path = require('path')

let recognizer = null
let vad = null
let currentModelKey = null

function ensureRecognizer(modelKey, modelsDir) {
  if (recognizer && currentModelKey === modelKey) return
  recognizer?.free?.()
  vad?.free?.()
  const modelDir = path.join(modelsDir, modelKey)
  recognizer = new sherpa.OfflineRecognizer({
    modelConfig: {
      senseVoice: {
        model: path.join(modelDir, 'model.int8.onnx'),
        language: 'auto',
        useItn: true,
      },
      tokens: path.join(modelDir, 'tokens.txt'),
      numThreads: 2,                        // §sherpa-research 8.5
      provider: 'cpu',
      debug: false,
    },
    decodingMethod: 'greedy_search',
  })
  vad = new sherpa.VoiceActivityDetector({
    modelConfig: {
      sileroVad: {
        model: path.join(modelsDir, 'silero-vad-v5', 'silero_vad.onnx'),
        threshold: 0.5,
        minSilenceDuration: 0.4,            // 秒
        minSpeechDuration: 0.25,
        maxSpeechDuration: 30,              // 单段最长 30s，否则强切（防长独白挂死）
      },
      sampleRate: 16000,
      debug: false,
    },
    bufferSizeInSeconds: 60,
  })
  currentModelKey = modelKey
}
```

**懒加载**：模型不在 utility process 启动时就 load，**第一个任务到达时** ensure。冷启动到主窗口可交互 < 1.5s（PRD §7.1）的指标因此达成。

模型 unload 策略：

- 任务空闲 10 分钟后主动 `free`，释放 ~1 GB（PRD §7.1 内存 < 1.5 GB）
- 主进程发"低内存压力"消息时立即 unload（监听 `app.getAppMetrics()` 异常或 `'render-process-gone'`）

### 3.4 转录主循环：分轨独立跑，最后按时间戳归并

PRD §6 决定 `transcript.segments[i].speaker = 'mic' | 'system'`。实现就是**两轨各跑一遍 VAD + ASR，再按 start 时间排序合并**：

```
transcribe(input):
  micSegs    = audioFiles.mic    ? processTrack(mic,    'mic',    lang)    : []
  systemSegs = audioFiles.system ? processTrack(system, 'system', lang)    : []
  if !micSegs && !systemSegs:                               # 只有 mixed.wav
    return processTrack(mixed, 'mixed', lang)
  return merge(micSegs, systemSegs)                          # 按 start 升序，相同则 mic 优先

processTrack(wavPath, speaker, lang):
  pcm16k = readWavAsFloat32Mono16k(wavPath)               # sherpa-onnx 要 16k mono
  segments = []
  for speech in VAD.detect(pcm16k):                         # 输出 (startSec, endSec) 列表
    result = recognizer.decode(speech.pcm)
    if result.text.trim():
      segments.push({
        start: speech.start, end: speech.end,
        text: postprocess(result.text),
        speaker,
        tokens: result.tokens,                              # 字级时间戳，data-model §4.2
        confidence: result.confidence,
      })
    onEvent({ type: 'progress', phase: 'asr', processedMs: speech.end * 1000 })
  return segments
```

**读 WAV → 16k mono float32**：

- WAV 是 48k stereo 16-bit（audio-capture §2.4）
- system 是 stereo，下采样前先 mono mix（L+R 平均）
- mic 已经是 mono，只需下采样
- **下采样选型**：**首选 sherpa-onnx-node 暴露的 resampler**，回退到自写 polyphase

| 选项 | 决定 | 理由 |
|---|---|---|
| sherpa-onnx-node `Resampler` 类 | **首选** | 已经在加载、零额外依赖、与 sherpa 内部一致 |
| 自写 polyphase FIR 48k→16k | **回退** | 若 N-API 没暴露 Resampler；polyphase 比线性插值损质量低；纯 JS / TypedArray 实现，无 native |
| ffmpeg-static pipe | **否** | 多一个 native + 签名负担；仅在云端 mp3 编码用 |
| 线性插值 | **否** | 高频混叠，明显损识别率 |

**spike-006 验证项**：确认 `sherpa.Resampler` 是否在 N-API 暴露；不暴露则当场写 32-tap polyphase（< 100 行 TS），benchmark 100k 样本耗时 < 5 ms。**不允许"两种都行"留进开发阶段**。

性能：1 小时 stereo 48k 16-bit ≈ 660 MB，转 16k mono float32 ≈ 110 MB；用流式分块（每 30s 一块）读避免一次 1 GB 驻留。

### 3.5 标点 / ITN

sherpa-onnx 的 SenseVoice 自带标点 + `useItn=true` 做数字归一化（sherpa-research §8.8）。v0.1 **不叠 CT-Transformer**，节省 38 MB 模型 + 二次推理。

postprocess 仅做轻量修正：
- 去除多余空格
- 中英混排标点统一（如把"," → "，" 当且仅当前后是中文）
- 去掉 SenseVoice 输出可能的 `<|emotion|>` / `<|event|>` 等 tag（关掉 emotion/event detection 后理论上没有，但兜底）

```ts
function postprocess(text: string): string {
  return text
    .replace(/<\|[^|]+\|>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/([一-龥])([,.?!])([一-龥])/g, (_, a, p, b) =>
      a + ({ ',': '，', '.': '。', '?': '？', '!': '！' }[p] || p) + b)
    .trim()
}
```

### 3.6 取消与失败

- 主进程通过 message 发 `{ type: 'cancel', taskId }`；utility 设置 `cancelled` flag，每个 VAD segment 之间检查
- 已经跑出来的 segment **丢弃**（v0.1 简化；data-model §4.5）
- utility 崩溃：主进程监听 `'exit'` 事件，标记 task=failed + 自动重启 utility process（最多 3 次，超过则提示"沙箱崩溃"）
- 模型加载失败（文件缺失 / SHA 不对）：返回 `{ status: 'failed', reason: 'model-missing' }`，主进程引导用户重新下载

### 3.7 并发 & 持久化队列

- v0.1 **串行**：同一时刻只跑一个转录任务，多个录音排队
- 理由：单任务已经吃 1 GB 内存 + 1-2 CPU 线程；并发收益有限、状态机复杂度高
- 队列管理在主进程 `TranscribeOrchestrator`：FIFO，UI 显示"等待中"状态
- v0.x 可加并发：utility process 池 / 单进程多 Recognizer 实例

**队列的持久化**——队列本身在内存，但**任务身份**通过 `meta.transcribe.status='pending'` 持久化在 meta.json 里：

```
启动时：
  扫 recordings/ 找 meta.transcribe.status ∈ {pending, running} 的录音
    → status=running 视作崩溃中断 → 标 pending 重新入队
    → status=pending → 入队
  按 startedAt 顺序排队
```

**云端模式 + 离线**：
- engine 是 OpenAI 兼容 API + 浏览器 `navigator.onLine` === false → 任务标 `meta.transcribe.status='pending'` 不实际发起请求
- 主进程监听 `online` 事件（renderer 通过 IPC 转发 `window.online`）→ 触发 Orchestrator 重检队列
- 也定期（每 60s）尝试 `engine.ping()`，作为 `navigator.onLine` 不可靠时的兜底

UI 体验：录音完成后状态显示"已排队，等待网络"，恢复后自动跑。

---

## 4. 云端引擎：OpenAI 兼容转录

### 4.1 接口约定

走 [OpenAI Audio Transcription API](https://platform.openai.com/docs/api-reference/audio/createTranscription) 兼容协议：

```
POST {baseUrl}/audio/transcriptions
Authorization: Bearer {apiKey}
Content-Type: multipart/form-data

fields:
  file: <wav>
  model: <user-configured>
  language: zh|en|auto
  response_format: verbose_json    # 拿带时间戳的输出
  timestamp_granularities[]: word
```

返回结构（OpenAI v1 verbose_json）：

```json
{
  "task": "transcribe",
  "language": "zh",
  "duration": 123.4,
  "text": "...",
  "segments": [
    { "start": 0.0, "end": 3.2, "text": "...", "tokens": [...], "avg_logprob": ... }
  ],
  "words": [ { "word": "...", "start": 0.0, "end": 0.3 }, ... ]
}
```

兼容性：DeepSeek、零一万物、阿里通义、Groq、本地 OpenAI 兼容代理（如 ollama-openai-proxy）默认都遵从。**不兼容**的（如 Azure 老接口）需要用户自行架代理；v0.1 不做适配。

### 4.2 分轨与文件大小

OpenAI 单文件上限 25 MB；1 小时 mono 48k 16-bit ≈ 350 MB，超限。两层处理：

1. **转码为 mp3 / m4a 后上传**：48k mono → 64 kbps mp3 ≈ 28 MB/h，缩 12 倍
2. **超过仍超限的长录音**：用本地 VAD 切片（同 §3.4，但切到 < 24 MB），逐段上传，时间戳本地拼

转码用 ffmpeg-static（约 20 MB 增包）。理由：sherpa-onnx 没有压缩编码、Node 内置的 audio 编码能力等于 0。

**ffmpeg-static 引用范围**：**仅云端转录**用（mp3/m4a 转码 + 切片）。本地引擎的 48k→16k 下采样不走 ffmpeg（见 §3.4 B1 决策），避免本地引擎引入 ffmpeg 依赖。

**macOS 签名清单**（在 electron-builder afterPack 里处理）：

```
app.asar.unpacked/node_modules/
├── sherpa-onnx-darwin-{arch}/          # 主进程 / utility 用
│   ├── *.node                          # codesign + hardened runtime + allow-jit
│   └── *.dylib                         # codesign + install_name_tool 改写
├── sherpa-onnx-node/                   # JS 胶水
└── ffmpeg-static/
    └── ffmpeg                          # codesign + hardened runtime + allow-unsigned-executable-memory
```

asarUnpack glob 必须显式覆盖 `ffmpeg-static/**` 与 `sherpa-onnx-*/**`，**不能**依赖 electron-builder 的自动检测。详细见 ADR-0002（待写）。

分轨场景：mic 和 system 分别上传，speaker 字段本地设。

### 4.3 网络与重试

- 超时：60s connect + 5min upload + 30s read first byte
- 重试：429 / 5xx 指数退避 3 次（1s / 5s / 15s）
- 4xx 不重试：401/403 提示 key 错误；413 提示文件超限（应该不会，前面已切片）
- AbortController 接 EngineFacade.signal

### 4.4 流式响应

v0.1 **不**走 OpenAI 的 streaming（SSE）：

- 实现复杂度高、错误恢复语义不清
- 一次性返回 verbose_json 已经够用，UI 上"上传中→等待→完成"三态足够
- v0.x 如果云端转录平均耗时超 30s 再考虑

### 4.5 隐私边界

调云端转录 = 用户已经在 `privacyMode='cloud'` 下显式同意。但仍要：

- API 调用日志**不**记录请求 body（含音频内容）
- 不存"云端响应原文"——仅落 transcript.json + meta.transcribe.apiBaseUrl（脱敏到 host）
- onboarding 切云端的告知由 02-design 的 onboarding 屏 4b 副文案承担（"音频将通过 HTTPS 上传到 {host}"），架构层不强制单独 modal，避免重复打扰

---

## 5. 模型下载

### 5.1 模型 Registry

app 内置一份 JSON（编译进 bundle，不可远程更新——避免供应链风险）：

```ts
// electron/main/transcribe/local/modelRegistry.ts
export const MODELS: Record<string, ModelEntry> = {
  'sense-voice-zh-en-ja-ko-yue-2025-09-09-int8': {
    kind: 'asr',
    displayName: 'SenseVoice (zh/en/ja/ko/yue, int8)',
    sizeBytes: 234_000_000,
    files: [
      { relPath: 'model.int8.onnx', sha256: 'abc...', bytes: 233_000_000 },
      { relPath: 'tokens.txt',      sha256: 'def...', bytes: 308_000 },
    ],
    sources: [
      'https://hf-mirror.com/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2025-09-09/resolve/main/{file}',
      'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2025-09-09-int8-{file}',
      'https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2025-09-09/resolve/main/{file}',
    ],
    isDefault: true,
  },
  'silero-vad-v5': {
    kind: 'vad',
    sizeBytes: 2_100_000,
    files: [{ relPath: 'silero_vad.onnx', sha256: '...', bytes: 2_100_000 }],
    sources: [...],
  },
}
```

字段定义见 [`data-model.md`](./data-model.md) §7。

### 5.2 下载器

```
download(modelKey):
  entry = MODELS[modelKey]
  for file in entry.files:
    for sourceUrl in pickSourceOrder(entry.sources):
      try:
        downloadWithResume(sourceUrl, dest, expectedSha256, expectedBytes)
        verifyHashOrThrow(dest, expectedSha256)
        break
      except (TimeoutError, NetworkError, ChecksumMismatch) as e:
        log.warn(e); continue
    else:
      throw AllSourcesFailedError
  writeManifest(modelKey, entry)
```

### 5.3 源选择策略

`pickSourceOrder` 由 `settings.modelDownload.sourceOrder` 决定，默认：

```
['hf-mirror', 'modelscope', 'github-releases']  # 国内（locale=zh-CN）
['github-releases', 'huggingface']               # 海外
```

启动 onboarding 时按系统 locale 选默认顺序；用户可在设置改。

**首次下载时并发 HEAD 测速**：对每个 source 发 HEAD，5s 超时，按响应快的优先——避免某个镜像 DNS 解析慢拖整体。

### 5.4 断点续传

- HTTP `Range: bytes={offset}-`
- 服务端不支持 Range → 全量重下
- 断点元数据存 `{download}.partial` 同目录：`{ offset, sha256-so-far }`
- 完成后 rename 为目标文件名

### 5.5 SHA256 校验

- 流式计算（边下边算），完成时拿最终 hash
- 不匹配 → 删 partial → 切下一个 source 重下
- 三次镜像都不匹配 → 报错 "模型源损坏，请检查网络或换源"

### 5.6 UI 事件

下载器通过 IPC 给 onboarding / 设置页发：

| 事件 | payload |
|---|---|
| `model:download:start` | `{ modelKey, totalBytes, source }` |
| `model:download:progress` | `{ modelKey, downloadedBytes, totalBytes, bytesPerSec, etaMs }` |
| `model:download:source-switched` | `{ modelKey, from, to, reason }` |
| `model:download:done` | `{ modelKey, durationMs }` |
| `model:download:error` | `{ modelKey, code, message }` |
| `model:download:cancelled` | `{ modelKey }` |

详细 schema 见 [`ipc-contract.md`](./ipc-contract.md) §4。

### 5.7 后台下载

PRD §5.1："国内用户默认从镜像源下载…失败显式三选项不卡死"。Onboarding 可允许用户关掉窗口让下载继续：

- 下载任务在主进程，与 onboarding 窗口生命周期解耦
- 关窗后菜单栏 Tray 显示"下载中 45%"
- 完成后 Tray 弹通知 "模型已就绪，点击进入"

---

## 6. LLM 摘要

### 6.0 SummarizerFacade 抽象

与 `TranscribeEngine` 对称：

```ts
interface Summarizer {
  readonly kind: 'openai-compatible' | 'local-llm'   // v0.1 仅前者；v0.x 加 Ollama/llama.cpp 时新增 adapter

  run(
    input: SummarizeInput,
    onChunk: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<SummarizeResult>

  ping(): Promise<{ ok: boolean, latencyMs?, error? }>
}

type SummarizeInput = {
  recordingId: string
  transcript: Transcript
  meta: Pick<RecordingMeta, 'title' | 'sessionType' | 'startedAt' | 'durationMs'>
  template: Template
}

type SummarizeResult = {
  text: string                                       // 完整 markdown
  model: string                                      // 实际用的 model 名
  inputTokens?: number                               // 若 API 返回
  outputTokens?: number
}

class SummarizerRegistry {
  private current?: Summarizer
  get(): Summarizer { ... }                          // 同 EngineRegistry，build/rebuild/ensureReady
}
```

v0.1 唯一实现 `OpenAICompatibleSummarizer`。v0.x 加本地 LLM（Ollama / llama.cpp）= 新增 `LocalLlamaSummarizer` adapter，调用方（TranscribeOrchestrator 完成后的 hook）不变。

**为什么 v0.1 花成本做这层抽象**：转录 / 摘要语义高度对称（都是"长 ASR 输出 → 模型→ 文本"），不抽现在写一遍、v0.x 加本地 LLM 时再重构。

### 6.1 触发点

```
transcript.status = done
  → if settings.cloudLLM 已配置 && settings.recording.autoSummaryAfterTranscribe:
       template = pickTemplate(meta.sessionType)
       summary = runLLM(template, transcript, meta)
       write summary.md
       meta.summary.status = done
```

用户也可手动从 UI 触发"重新生成摘要"，跳过 autoSummary 开关。

### 6.2 模板选择

```ts
function pickTemplate(sessionType: SessionType): Template {
  // 1. 找用户在 settings 里给该 sessionType 设的默认模板
  const userDefault = settings.recording.templatePerSessionType?.[sessionType]
  if (userDefault) return loadTemplate(userDefault)

  // 2. 找内置模板里 sessionType 匹配的
  const builtinMap = {
    meeting: 'builtin/meeting',
    note: 'builtin/note',
    'interview-as-interviewer': 'builtin/interview-as-interviewer',
    'interview-as-candidate': 'builtin/interview-as-candidate',
    lecture: 'builtin/lecture',
    // v0.1 不为 podcast 出专用模板：会话类型选 podcast 时套 note 模板
    // UI 在摘要面板顶部显示"用「要点速记」模板（podcast 暂无专用模板）"以避免用户误以为有专属逻辑
    podcast: 'builtin/note',
    general: 'builtin/note',
  }
  return loadTemplate(builtinMap[sessionType])
}
```

### 6.3 变量替换

Template.prompt 里可用：

| 变量 | 内容 |
|---|---|
| `{{title}}` | meta.title |
| `{{date}}` | startedAt 格式化为 YYYY-MM-DD HH:mm |
| `{{durationMin}}` | durationMs / 60000 取整 |
| `{{sessionType}}` | "会议" / "笔记" / ... 中文名 |
| `{{transcript}}` | segments 拼成的纯文本（带 speaker 前缀） |
| `{{transcript.mic}}` | 仅 mic 轨 |
| `{{transcript.system}}` | 仅 system 轨 |

transcript 拼接格式：

```
[mic 00:01] 你好我们今天来聊一下产品规划
[system 00:05] 好的我先来过一下议题
```

行内时间戳辅助 LLM 引用具体时刻。`{{transcript}}` 在主进程拼装，不暴露字级 tokens（节省 token 数）。

### 6.4 Token 上限与切片

长录音 transcript 可能超 LLM context 上限。处理顺序：

1. 估算 token 数（中文 ≈ 1.5 char/token，简单 `transcript.length / 1.5`）
2. 若 < `model.contextWindow - prompt - 1500`（留给输出），直接一次性发
3. 否则：**MapReduce** 策略
   - Map：按 chunk 大小（默认 30 分钟段）切分，分别用同模板的"中间产物"prompt 生成子摘要
   - Reduce：所有子摘要 + 原 prompt 再请求一次，得最终结果
   - v0.1 简化：仅支持模板"会议纪要" / "章节笔记"两种走 MapReduce；其它太长就截断 + 加 "(已截断)" 标记

模型 contextWindow 在 settings.cloudLLM 里可配（默认 128k）。

### 6.5 API 调用

```
POST {baseUrl}/chat/completions
Authorization: Bearer {apiKey}

{
  "model": settings.cloudLLM.model,
  "messages": [
    { "role": "system", "content": template.prompt.system },
    { "role": "user",   "content": fillVars(template.prompt.user, ctx) }
  ],
  "stream": true,
  "temperature": 0.3,
  "max_tokens": template.output.maxTokens ?? 2000
}
```

**走 SSE streaming**：UI 上能看到字段一段段生成，体验远好于"转圈 30s 出整段"。

renderer 订阅 `summary:chunk` 事件实时拼接到 UI；主进程同时 buffer 到内存，全部完成再 atomic write summary.md。

### 6.6 错误处理

| 错误 | 行为 |
|---|---|
| 401 / 403 | meta.summary.status=failed, error='auth'；UI 引导用户检查 API key |
| 429 | 退避后重试一次；仍失败 → failed |
| 5xx | 重试 2 次，间隔指数退避 |
| 网络中断 | 已收到的 partial 丢弃（v0.1）；状态=failed，可手动重试 |
| 模型不支持 streaming | fallback 到非 streaming 一次性请求 |

LLM 摘要失败**不**影响转录结果——transcript.json 还在，用户可手动重试。

---

## 7. 端到端时序

完整链路（与 overview §4.1 对应，这里展开转录细节）：

```
[main]                                      [utility]                      [cloud LLM]
  recording.status = done
  ├─ engineRegistry.get() → LocalSenseVoiceEngine
  ├─ utility ensureRecognizer(modelKey)
  │  └────────────────────────────────►  懒加载 SenseVoice + Silero (首次 ~3s)
  ├─ utility processTrack(mic.wav)
  │  └────────────────────────────────►  read WAV → 48k stereo → 16k mono
  │                                       VAD 切片 (N 段)
  │                                       for each: Recognizer.decode
  │                                       <─── progress 每段 ─── (RTF ~0.05)
  ├─ utility processTrack(system.wav)
  │  └────────────────────────────────►  同上
  ├─ merge segments by start
  ├─ write transcript.json (atomic)
  ├─ meta.transcribe.status = done
  ├─ ipc → renderer: transcript:done
  │
  ├─ if autoSummary && cloudLLM ok:
  │    template = pickTemplate(meta.sessionType)
  │    prompt = fillVars(template, transcript)
  │    POST /chat/completions (stream=true)
  │    ─────────────────────────────────────────────►  SSE 流
  │    ◄─── delta tokens (UI 实时刷)               ◄──
  │    onComplete: write summary.md
  │    meta.summary.status = done
  │    ipc → renderer: summary:done
```

---

## 8. 性能预算

| 阶段 | 1 小时录音目标 | 来源 |
|---|---|---|
| 读 WAV + 下采样 (48k→16k stereo→mono) | < 10s | I/O + 简单 DSP |
| VAD（单轨） | < 5s | Silero VAD 极快 |
| ASR（SenseVoice int8, M1, num_threads=2） | < 3 min | RTF ~0.05 |
| ASR 双轨合计 | < 6 min | 串行；并行可减一半，v0.x |
| 后处理（标点合并 / 排序） | < 1s | 内存操作 |
| 写 transcript.json | < 1s | 单文件 ~150 KB |
| LLM 摘要（128k 模型，~30k tokens 输入） | 15-30s | 主要在 API |

总计：**~6 分钟出转录 + ~30s 出摘要**。满足 PRD §1.3 "1 小时会议跑完"的体验目标。

CPU 占用预算：

- 转录中 utility process 200%（双线程）—— 用户感知到风扇转
- 主进程 < 2% —— UI 不卡
- renderer < 5% —— 播放器 / 列表 / 详情滚动正常

---

## 9. Plan B 清单

| 万一 | 退路 |
|---|---|
| sherpa-onnx 在 macOS 签名包加载失败 | 切 onboarding "云端" 路径；UI 大字提示"本地引擎不可用，请配置云端" |
| utility process 频繁崩溃 | 模型 unload + 重启策略；连续 3 次失败提示用户切云 |
| 模型镜像三源全挂 | 提供"手动下载并拖入" 入口：用户从浏览器下载 zip，app 校验后解压到 models/ |
| 云端 API 限速 | 切回本地（如已下载）；UI 明确告知 |
| OpenAI verbose_json 字段变更 | 加 schema 适配层；fall back 只取 segments + text，丢失字级精度 |
| ffmpeg-static 在 ARM Mac / Win 上签名问题 | 备选：sherpa-onnx 自带 audio 解码（仅 WAV）+ Node wav writer 直接生成 mp3 编码失败时回退"上传原 WAV"（限于短录音） |

---

## 10. 开放问题

- **MapReduce 的 chunk 边界是否考虑语义**：现在切按时间 30 分钟，可能把一句话切断。要不要先按 segments 的 silence 边界对齐？倾向后者，v0.1 简化为"按 segment 边界 + 最大 30 分钟"。
- **VAD `maxSpeechDuration=30s` 是否合适**：单段太长 ASR 会慢，太短会切碎语义。30s 是经验值，spike-003 量化。
- **本地 + 云端混合**：用户主动让本地跑转录、云端跑摘要。当前架构已经支持（独立 EngineFacade），UI 上是否需要分别开关？倾向 v0.1 不暴露，自动跟随 `cloudLLM` 配置。
- **本地 LLM 摘要**：v0.x 是否引 Ollama / llama.cpp 跑本地 LLM？前提是用户机器够跑 8B 模型。**不在 v0.1 范围**。
- **utility process 与多录音排队**：当前串行。若用户连按 5 次快捷键录 5 段短笔记，是否要并行？需要先量化"双 Recognizer 并发"内存与速度。

---

## 11. spike / 验收清单

进入 04-development M4 之前必须打勾：

- [x] spike-003：sherpa-onnx + Electron 跑通离线转录 1 段中文 wav（已在调研验证）
- [x] spike-004：macOS 完整签名 + 公证 + staple 通过（已在调研验证）
- [ ] spike-006（新增）：utility process 跑 1h 录音转录，CPU / 内存 / RTF 都在预算内
- [ ] spike-007（新增）：镜像 fallback 测试：在断网 / hf-mirror 慢 / github 快各组合下下载 SenseVoice 模型 OK
- [ ] spike-008（新增）：云端转录端到端：OpenAI / DeepSeek 至少一家走通 verbose_json + 时间戳合理
- [ ] spike-009（新增）：长 transcript MapReduce 摘要，3 小时录音不超 token 限

---

## 12. 跨文档导航

| 想了解 | 看 |
|---|---|
| transcript.json / summary.md / templates 字段 | [`data-model.md`](./data-model.md) §4 / §6 / §7 |
| renderer 看到的转录 / 摘要 IPC 事件全集 | [`ipc-contract.md`](./ipc-contract.md) §3 / §4 / §5 |
| WAV 文件来源、PCM 格式 | [`audio-capture.md`](./audio-capture.md) |
| 进程拓扑、utility process 全局位置 | [`overview.md`](./overview.md) §2 |
| sherpa-onnx 模型对比、GPU 路线 | [`../01-research/sherpa-onnx-research.md`](../01-research/sherpa-onnx-research.md) |
| 关键决策（sherpa-onnx 选型、utility process、模型按需下载） | [`adr/`](./adr/) 待写 |
