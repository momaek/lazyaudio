// spike-011 benchmark 主入口
//
// 跑 3 个引擎 × 5 段中文 fixture:
//   gold  = SenseVoice offline 一把推 (作 reference,也是 Pass B 的真实行为)
//   poc-a = streaming Zipformer (OnlineRecognizer),按 100ms 喂,记 hypothesis 轨迹
//   poc-b = Silero VAD 切片 + SenseVoice 短窗
//
// 指标:
//   CER(poc vs gold)           — 与 dev-plan §spike-011 决策表对齐
//   tail latency               — 模拟实时推流:最后一段音频推完 → 最终结果出现的 wall-clock
//   per-segment latency (B 路) — VAD endpoint → 该段 ASR 出结果
//   rss peak                   — process.memoryUsage().rss 单次跑分峰值
//   hypothesis volatility (A 路)— 改写次数 / transition 总数
//   wall-clock total elapsed   — 调用方观感
//
// 用法:pnpm bench
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readWave, durationSeconds, iterateChunks, type Wave } from './lib/wav.js'
import { computeCer } from './lib/cer.js'
import {
  memoryRssMB,
  nowMs,
  computeVolatility,
  percentile,
  type HypothesisSnapshot,
} from './lib/metrics.js'

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sherpa = require('sherpa-onnx-node') as any

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const MODELS = path.join(ROOT, 'models')
const FIXTURES = path.join(ROOT, 'fixtures')
const RESULTS = path.join(ROOT, 'results')
mkdirSync(RESULTS, { recursive: true })

// ---- 模型路径 ----------------------------------------------------------------
const SV_DIR = path.join(
  MODELS,
  'sense-voice',
  'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09',
)
const SV_CONFIG = {
  featConfig: { sampleRate: 16000, featureDim: 80 },
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

const SZ_DIR = path.join(MODELS, 'streaming-zipformer')
const SZ_CONFIG = {
  featConfig: { sampleRate: 16000, featureDim: 80 },
  modelConfig: {
    transducer: {
      encoder: path.join(SZ_DIR, 'encoder-epoch-99-avg-1.int8.onnx'),
      decoder: path.join(SZ_DIR, 'decoder-epoch-99-avg-1.onnx'),
      joiner: path.join(SZ_DIR, 'joiner-epoch-99-avg-1.int8.onnx'),
    },
    tokens: path.join(SZ_DIR, 'tokens.txt'),
    numThreads: 2,
    provider: 'cpu',
    debug: 0,
  },
}

const VAD_CONFIG = {
  sileroVad: {
    model: path.join(MODELS, 'silero-vad', 'silero_vad.onnx'),
    threshold: 0.5,
    minSpeechDuration: 0.25,
    minSilenceDuration: 0.5,
    windowSize: 512,
  },
  sampleRate: 16000,
  debug: 0,
  numThreads: 1,
}

// ---- 工具 -------------------------------------------------------------------
function rss(): number {
  return memoryRssMB()
}

function trackPeakRss(): { sample(): void; peak(): number } {
  let peak = rss()
  return {
    sample: () => {
      const r = rss()
      if (r > peak) peak = r
    },
    peak: () => peak,
  }
}

// ---- gold:SenseVoice offline 一把推 -----------------------------------------
type GoldResult = {
  text: string
  elapsedMs: number
  rtf: number
  rssPeakMB: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function runGold(recognizer: any, wave: Wave): GoldResult {
  const tracker = trackPeakRss()
  const t0 = nowMs()
  const stream = recognizer.createStream()
  stream.acceptWaveform({ sampleRate: wave.sampleRate, samples: wave.samples })
  recognizer.decode(stream)
  tracker.sample()
  const result = recognizer.getResult(stream)
  stream.free?.()
  const elapsedMs = nowMs() - t0
  const rtf = elapsedMs / 1000 / durationSeconds(wave)
  return {
    text: typeof result === 'string' ? result : (result.text ?? ''),
    elapsedMs,
    rtf,
    rssPeakMB: tracker.peak(),
  }
}

// ---- POC A:streaming Zipformer,按 100ms 喂,记 hypothesis 轨迹 --------------
type PocAResult = {
  finalText: string
  snapshots: HypothesisSnapshot[]
  tailLatencyMs: number
  totalElapsedMs: number
  rssPeakMB: number
}

const CHUNK_MS = 100

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runPocA(recognizer: any, wave: Wave): Promise<PocAResult> {
  const tracker = trackPeakRss()
  const stream = recognizer.createStream()
  const snapshots: HypothesisSnapshot[] = []
  const t0 = nowMs()

  // 按 100ms chunk 推流,模拟实时(每推一块 sleep 到下一个 100ms 边界)
  let chunkIdx = 0
  for (const chunk of iterateChunks(wave, CHUNK_MS)) {
    stream.acceptWaveform({ samples: chunk, sampleRate: wave.sampleRate })
    while (recognizer.isReady(stream)) {
      recognizer.decode(stream)
    }
    tracker.sample()
    const r = recognizer.getResult(stream)
    snapshots.push({ tMs: nowMs() - t0, text: typeof r === 'string' ? r : (r.text ?? '') })
    chunkIdx++
    // sleep 到下一个 chunk 的实时边界(模拟真实采集节奏)
    const targetT = chunkIdx * CHUNK_MS
    const slack = targetT - (nowMs() - t0)
    if (slack > 0) await new Promise((res) => setTimeout(res, slack))
  }
  const lastAudioMs = nowMs() - t0

  // tail padding 让模型把尾部 hypothesis flush 成 confirmed
  const tailPadding = new Float32Array(Math.floor(wave.sampleRate * 0.4))
  stream.acceptWaveform({ samples: tailPadding, sampleRate: wave.sampleRate })
  while (recognizer.isReady(stream)) {
    recognizer.decode(stream)
  }
  const r = recognizer.getResult(stream)
  const finalT = nowMs() - t0
  snapshots.push({ tMs: finalT, text: typeof r === 'string' ? r : (r.text ?? '') })

  stream.free?.()
  return {
    finalText: snapshots[snapshots.length - 1]?.text ?? '',
    snapshots,
    tailLatencyMs: finalT - lastAudioMs,
    totalElapsedMs: finalT,
    rssPeakMB: tracker.peak(),
  }
}

// ---- POC B:Silero VAD 切片 + SenseVoice 短窗 -------------------------------
type PocBSegment = {
  startSec: number
  endSec: number
  asrLatencyMs: number
  text: string
}
type PocBResult = {
  finalText: string
  segments: PocBSegment[]
  totalElapsedMs: number
  rssPeakMB: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runPocB(svRecognizer: any, vad: any, wave: Wave): Promise<PocBResult> {
  const tracker = trackPeakRss()
  const t0 = nowMs()
  const segments: PocBSegment[] = []

  const window = VAD_CONFIG.sileroVad.windowSize
  // 按 chunk 喂 VAD,触发 endpoint 后取 segment → 喂 SenseVoice 离线
  let offset = 0
  let chunkIdx = 0
  while (offset + window <= wave.samples.length) {
    const slice = wave.samples.subarray(offset, offset + window)
    vad.acceptWaveform(slice)
    offset += window
    chunkIdx++

    // 用 CHUNK_MS 节拍模拟实时(每推 ~100ms 音频后小睡)
    if (chunkIdx % Math.max(1, Math.floor((wave.sampleRate * 0.1) / window)) === 0) {
      const targetT = ((offset / wave.sampleRate) * 1000) | 0
      const slack = targetT - (nowMs() - t0)
      if (slack > 0) await new Promise((res) => setTimeout(res, slack))
    }

    while (!vad.isEmpty()) {
      const segment = vad.front()
      vad.pop()
      const tSegmentReady = nowMs() - t0
      // 离线跑短窗
      const asrT0 = nowMs()
      const segStream = svRecognizer.createStream()
      segStream.acceptWaveform({
        sampleRate: wave.sampleRate,
        samples: segment.samples,
      })
      svRecognizer.decode(segStream)
      const r = svRecognizer.getResult(segStream)
      segStream.free?.()
      tracker.sample()
      const text = typeof r === 'string' ? r : (r.text ?? '')
      segments.push({
        startSec: segment.start / wave.sampleRate,
        endSec: (segment.start + segment.samples.length) / wave.sampleRate,
        asrLatencyMs: nowMs() - asrT0,
        text,
      })
      // 防止未使用的告警
      void tSegmentReady
    }
  }
  // 喂残余样本作 endpoint flush
  vad.flush()
  while (!vad.isEmpty()) {
    const segment = vad.front()
    vad.pop()
    const segStream = svRecognizer.createStream()
    segStream.acceptWaveform({ sampleRate: wave.sampleRate, samples: segment.samples })
    svRecognizer.decode(segStream)
    const r = svRecognizer.getResult(segStream)
    segStream.free?.()
    tracker.sample()
    const text = typeof r === 'string' ? r : (r.text ?? '')
    segments.push({
      startSec: segment.start / wave.sampleRate,
      endSec: (segment.start + segment.samples.length) / wave.sampleRate,
      asrLatencyMs: 0,
      text,
    })
  }
  vad.reset()
  return {
    finalText: segments.map((s) => s.text).join(' '),
    segments,
    totalElapsedMs: nowMs() - t0,
    rssPeakMB: tracker.peak(),
  }
}

// ---- 主流程 ------------------------------------------------------------------
type FixtureBench = {
  name: string
  durationSec: number
  gold: GoldResult
  pocA: PocAResult & {
    cerVsGold: number
    volatility: { rewrites: number; transitions: number; rewriteRate: number }
  }
  pocB: PocBResult & {
    cerVsGold: number
    segmentCount: number
    p50LatencyMs: number
    p95LatencyMs: number
  }
}

async function main(): Promise<void> {
  console.log(`sherpa-onnx-node version: ${sherpa.version ?? 'unknown'}`)
  console.log(`gitDate: ${sherpa.gitDate ?? 'unknown'}`)
  console.log('')

  // 列 fixture
  const wavs = readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.wav'))
    .sort()
  console.log(`fixtures: ${wavs.join(', ')}`)

  // 准备 3 个引擎
  console.log('\nLoading SenseVoice (gold + B inner)...')
  const sv = new sherpa.OfflineRecognizer(SV_CONFIG)
  const svRssAfterLoad = rss()

  console.log('Loading streaming Zipformer (A)...')
  const sz = new sherpa.OnlineRecognizer(SZ_CONFIG)
  const szRssAfterLoad = rss()

  console.log('Loading Silero VAD (B outer)...')
  const vad = new sherpa.Vad(VAD_CONFIG, 60 /* buffer seconds */)
  const vadRssAfterLoad = rss()

  const baselineRss = rss()
  console.log(
    `\nrss after loading all: SV=${svRssAfterLoad.toFixed(0)} SZ=${szRssAfterLoad.toFixed(0)} VAD=${vadRssAfterLoad.toFixed(0)} now=${baselineRss.toFixed(0)} MB`,
  )

  const results: FixtureBench[] = []
  for (const wavName of wavs) {
    const wavPath = path.join(FIXTURES, wavName)
    const wave = readWave(wavPath)
    const dur = durationSeconds(wave)
    console.log(
      `\n=== ${wavName} (${dur.toFixed(2)}s, sr=${wave.sampleRate}, samples=${wave.samples.length}) ===`,
    )

    console.log('  [gold] SenseVoice offline...')
    const gold = runGold(sv, wave)
    console.log(
      `    elapsed ${gold.elapsedMs.toFixed(0)}ms (RTF ${gold.rtf.toFixed(3)})  text:  ${gold.text}`,
    )

    console.log('  [A] streaming Zipformer @ 100ms chunks...')
    const pocA = await runPocA(sz, wave)
    const aCer = computeCer(gold.text, pocA.finalText).cer
    const aVol = computeVolatility(pocA.snapshots)
    console.log(
      `    tail-latency ${pocA.tailLatencyMs.toFixed(0)}ms  CER ${(aCer * 100).toFixed(1)}%  rewrites ${aVol.rewrites}/${aVol.totalTransitions}  text:  ${pocA.finalText}`,
    )

    console.log('  [B] Silero VAD + SenseVoice short-window...')
    const pocB = await runPocB(sv, vad, wave)
    const bCer = computeCer(gold.text, pocB.finalText).cer
    const segLatencies = pocB.segments.map((s) => s.asrLatencyMs)
    console.log(
      `    segments ${pocB.segments.length}  p50-lat ${percentile(segLatencies, 50).toFixed(0)}ms  p95 ${percentile(segLatencies, 95).toFixed(0)}ms  CER ${(bCer * 100).toFixed(1)}%  text:  ${pocB.finalText}`,
    )

    results.push({
      name: wavName,
      durationSec: dur,
      gold,
      pocA: {
        ...pocA,
        cerVsGold: aCer,
        volatility: {
          rewrites: aVol.rewrites,
          transitions: aVol.totalTransitions,
          rewriteRate: aVol.rewriteRate,
        },
      },
      pocB: {
        ...pocB,
        cerVsGold: bCer,
        segmentCount: pocB.segments.length,
        p50LatencyMs: percentile(segLatencies, 50),
        p95LatencyMs: percentile(segLatencies, 95),
      },
    })
  }

  const summary = {
    sherpa: { version: sherpa.version, gitDate: sherpa.gitDate },
    platform: { platform: process.platform, arch: process.arch, nodeVersion: process.version },
    loadedRssMB: { sv: svRssAfterLoad, sz: szRssAfterLoad, vad: vadRssAfterLoad, all: baselineRss },
    aggregate: {
      meanCerA: results.reduce((s, r) => s + r.pocA.cerVsGold, 0) / results.length,
      meanCerB: results.reduce((s, r) => s + r.pocB.cerVsGold, 0) / results.length,
      meanTailLatencyA: results.reduce((s, r) => s + r.pocA.tailLatencyMs, 0) / results.length,
      meanP95LatencyB: results.reduce((s, r) => s + r.pocB.p95LatencyMs, 0) / results.length,
      meanVolatilityA:
        results.reduce((s, r) => s + r.pocA.volatility.rewriteRate, 0) / results.length,
    },
    fixtures: results,
  }
  const out = path.join(RESULTS, 'spike-011.json')
  writeFileSync(out, JSON.stringify(summary, null, 2))
  console.log(`\nwrote ${out}`)
  console.log(`\n=== Aggregate ===`)
  console.log(`mean CER A vs gold: ${(summary.aggregate.meanCerA * 100).toFixed(1)}%`)
  console.log(`mean CER B vs gold: ${(summary.aggregate.meanCerB * 100).toFixed(1)}%`)
  console.log(`mean tail-latency A: ${summary.aggregate.meanTailLatencyA.toFixed(0)} ms`)
  console.log(`mean p95-latency B: ${summary.aggregate.meanP95LatencyB.toFixed(0)} ms`)
  console.log(`mean A rewrite rate: ${(summary.aggregate.meanVolatilityA * 100).toFixed(1)}%`)
  const ratio =
    summary.aggregate.meanCerB === 0
      ? Infinity
      : summary.aggregate.meanCerA / summary.aggregate.meanCerB
  console.log(`A/B CER ratio: ${ratio.toFixed(2)}x`)
  console.log(
    `决策(若 A CER < B*1.2 → 选 A,否则 B):${ratio < 1.2 ? '走 A 真流式' : '走 B 短窗保底'}`,
  )
}

main().catch((e: unknown) => {
  console.error('FATAL:', e)
  process.exitCode = 1
})
