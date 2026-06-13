// T34/T61 — Pass A 实时引擎核心:Silero VAD 做语音/静音门控 + SenseVoice 离线短窗(ADR-0004)。
//
// 分段全在 JS 这边按「累计时长 + 真实停顿」做,不用 VAD 自己的闭合段:
//   sherpa Vad.front() 默认返回 external buffer,Electron utility 进程禁用 → 抛
//   "External buffers are not allowed";且每个 0.4s 微停顿就切一段会把识别碎成 2-3 个词、
//   上下文太短识别质量差。故只用 vad.isDetected() 判说话/静音,front 一律不碰,队列只 pop 清空。
//
// T61 调优:
//   - 第一版 hypothesis 至少攒够 minHypothesisMs 后再展示,避免中英文混合短窗语言判断乱跳。
//   - 所有 VAD / hypothesis 参数集中到 DEFAULT_VAD_STREAM_OPTIONS,便于 dogfood A/B。
//   - 每次识别只回传安全 debug 指标(raw tags / 字数 / 耗时),不记录转录正文。
//
// 累计当前段语音到 curBuf;满足任一条件就把整段识别成 confirmed、开新段:
//   1) 累计语音 ≥ commitTargetMs(~13s)→ 强制固化,对齐 Pass B 的上下文长度;
//   2) 静音 ≥ silenceCommitMs(~0.7s)且当前段已攒够 minCommitMs(~4s)→ 视作自然段落边界。
//   → 短于 0.7s 的微停顿不切,合并进同一段,上下文更长、识别更准。
// hypothesis = 说话进行中每 ~hypothesisIntervalMs 重识别当前 curBuf,与 confirmed 同 segmentId → UI 原地替换不跳行
//   (spike-013)。SenseVoice int8 在 M 系 RTF≈0.016(spike-012),重识别 ≤13s 成本可忽略。

import type { LiveRecognitionDebug, LiveSegment } from '@shared/transcribe/streaming-protocol'
import { noopPassAMetrics, type PassAMetrics } from './passa-metrics'

function int16ToFloat32(int16: Int16Array): Float32Array {
  const out = new Float32Array(int16.length)
  for (let i = 0; i < int16.length; i++) out[i] = (int16[i] ?? 0) / 32768
  return out
}

export interface VadStreamOptions {
  sampleRate: number
  vadWindowSamples: number
  hypothesisIntervalMs: number
  minHypothesisMs: number
  commitTargetMs: number
  silenceCommitMs: number
  minCommitMs: number
}

export const DEFAULT_VAD_STREAM_OPTIONS: VadStreamOptions = {
  sampleRate: 16_000,
  vadWindowSamples: 512,
  hypothesisIntervalMs: 800,
  minHypothesisMs: 2_000,
  commitTargetMs: 13_000,
  silenceCommitMs: 700,
  minCommitMs: 4_000,
}

interface OfflineStream {
  acceptWaveform(obj: { samples: Float32Array; sampleRate: number }): void
}
export interface Recognizer {
  createStream(): OfflineStream
  decode(s: OfflineStream): void
  getResult(s: OfflineStream): { text?: string }
}
export interface VadInstance {
  acceptWaveform(samples: Float32Array): void
  isDetected(): boolean
  // 注意:不暴露 front()。sherpa front() 返回 external buffer,Electron 会抛;分段不依赖 VAD 闭合段。
  isEmpty(): boolean
  pop(): void
  flush(): void
}

function cleanText(text: string): string {
  return text.replace(/<\|[^|]*\|>/g, '').trim()
}

function extractSenseVoiceTags(text: string): string[] {
  const tags: string[] = []
  for (const match of text.matchAll(/<\|([^|]*)\|>/g)) {
    const tag = match[1]
    if (tag) tags.push(tag)
  }
  return tags
}

function concat(chunks: Float32Array[]): Float32Array {
  let len = 0
  for (const c of chunks) len += c.length
  const out = new Float32Array(len)
  let p = 0
  for (const c of chunks) {
    out.set(c, p)
    p += c.length
  }
  return out
}

function msToSamples(ms: number, sampleRate: number): number {
  return Math.floor((sampleRate * ms) / 1000)
}

export class VadStream {
  private readonly options: VadStreamOptions
  private readonly hypothesisIntervalSamples: number
  private readonly minHypothesisSamples: number
  private readonly commitTargetSamples: number
  private readonly silenceCommitSamples: number
  private readonly minCommitSamples: number

  private leftover = new Float32Array(0)
  private totalSamples = 0
  private segCounter = 0
  // 当前进行中语音段
  private curId: string | null = null
  private curStartSample = -1
  private curBuf: Float32Array[] = []
  private curSamples = 0
  private silenceSamples = 0
  private lastHypSample = -Infinity

  constructor(
    private rec: Recognizer,
    private vad: VadInstance,
    private speaker: string,
    private emit: (s: LiveSegment) => void,
    private onProgress: (processedMs: number) => void,
    private metrics: PassAMetrics = noopPassAMetrics,
    options: Partial<VadStreamOptions> = {},
    private onDebug: (d: LiveRecognitionDebug) => void = () => {},
  ) {
    this.options = { ...DEFAULT_VAD_STREAM_OPTIONS, ...options }
    this.hypothesisIntervalSamples = msToSamples(
      this.options.hypothesisIntervalMs,
      this.options.sampleRate,
    )
    this.minHypothesisSamples = msToSamples(this.options.minHypothesisMs, this.options.sampleRate)
    this.commitTargetSamples = msToSamples(this.options.commitTargetMs, this.options.sampleRate)
    this.silenceCommitSamples = msToSamples(this.options.silenceCommitMs, this.options.sampleRate)
    this.minCommitSamples = msToSamples(this.options.minCommitMs, this.options.sampleRate)
  }

  private recog(
    samples: Float32Array,
    context: { segmentId: string; stability: 'hypothesis' | 'confirmed' },
  ): string {
    const startedAt = Date.now()
    const s = this.rec.createStream()
    s.acceptWaveform({ samples, sampleRate: this.options.sampleRate })
    this.rec.decode(s)
    const rawText = this.rec.getResult(s).text ?? ''
    const text = cleanText(rawText)
    const audioMs = Math.round((samples.length / this.options.sampleRate) * 1000)
    const recognizeMs = Date.now() - startedAt
    this.metrics.recognized(context.stability, audioMs, recognizeMs)
    this.onDebug({
      segmentId: context.segmentId,
      stability: context.stability,
      audioMs,
      recognizeMs,
      rawTags: extractSenseVoiceTags(rawText),
      cleanChars: text.length,
    })
    return text
  }

  private resetCurrent(): void {
    this.curId = null
    this.curStartSample = -1
    this.curBuf = []
    this.curSamples = 0
    this.silenceSamples = 0
    this.lastHypSample = -Infinity
  }

  /** 喂一块 16k mono Int16 */
  pushInt16(int16: Int16Array): void {
    let data = int16ToFloat32(int16)
    if (this.leftover.length > 0) data = concat([this.leftover, data])

    let i = 0
    const windowSamples = this.options.vadWindowSamples
    for (; i + windowSamples <= data.length; i += windowSamples) {
      const win = data.subarray(i, i + windowSamples)
      this.vad.acceptWaveform(win)
      this.totalSamples += windowSamples
      this.step(win)
    }
    this.leftover = data.slice(i)
    this.onProgress((this.totalSamples / this.options.sampleRate) * 1000)
  }

  private step(win: Float32Array): void {
    if (this.vad.isDetected()) {
      this.silenceSamples = 0
      if (this.curId == null) {
        this.curId = `seg-${this.segCounter++}`
        this.curStartSample = this.totalSamples - this.options.vadWindowSamples
        this.curBuf = []
        this.curSamples = 0
        this.lastHypSample = -Infinity
        this.metrics.segmentStarted(this.curId)
      }
      this.curBuf.push(win)
      this.curSamples += win.length
      if (this.curSamples >= this.commitTargetSamples) {
        this.commit('max-window') // 累计够长 → 强制固化
      } else {
        this.maybeHypothesis()
      }
    } else if (this.curId != null) {
      // 静音:累计;够长 + 当前段已攒够内容 → 段落边界,固化
      this.silenceSamples += win.length
      if (
        this.silenceSamples >= this.silenceCommitSamples &&
        this.curSamples >= this.minCommitSamples
      ) {
        this.commit('silence')
      }
    }
    // 不用 VAD 闭合段(front 是 external buffer),只 pop 清队列防原生侧无限堆积
    while (!this.vad.isEmpty()) this.vad.pop()
  }

  private maybeHypothesis(): void {
    if (this.curId == null) return
    // T61:短窗语言识别对中英文混合很不稳;第一版 hypothesis 至少攒够 minHypothesisMs。
    if (this.curSamples < this.minHypothesisSamples) return
    if (this.totalSamples - this.lastHypSample < this.hypothesisIntervalSamples) return
    this.lastHypSample = this.totalSamples
    const text = this.recog(concat(this.curBuf), {
      segmentId: this.curId,
      stability: 'hypothesis',
    })
    if (text) {
      this.emit({
        segmentId: this.curId,
        start: this.curStartSample / this.options.sampleRate,
        end: this.totalSamples / this.options.sampleRate,
        text,
        speaker: this.speaker,
        stability: 'hypothesis',
      })
    }
  }

  /** 把当前段整段识别成 confirmed、开新段 */
  private commit(reason: 'silence' | 'max-window' | 'flush'): void {
    if (this.curId == null || this.curSamples === 0) {
      this.resetCurrent()
      return
    }
    const text = this.recog(concat(this.curBuf), {
      segmentId: this.curId,
      stability: 'confirmed',
    })
    if (text) {
      this.emit({
        segmentId: this.curId,
        start: this.curStartSample / this.options.sampleRate,
        end: this.totalSamples / this.options.sampleRate,
        text,
        speaker: this.speaker,
        stability: 'confirmed',
      })
    }
    this.metrics.committed(this.curId, reason)
    this.resetCurrent()
  }

  /** 录音 stop:把未固化的当前段识别落定 */
  flush(): void {
    this.commit('flush')
    this.metrics.flush()
  }
}
