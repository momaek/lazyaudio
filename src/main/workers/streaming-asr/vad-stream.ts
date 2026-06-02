// T34 — Pass A 实时引擎核心:Silero VAD 做语音/静音门控 + SenseVoice 离线短窗(ADR-0004)。
//
// 分段全在 JS 这边按「累计时长 + 真实停顿」做,不用 VAD 自己的闭合段:
//   sherpa Vad.front() 默认返回 external buffer,Electron utility 进程禁用 → 抛
//   "External buffers are not allowed";且每个 0.4s 微停顿就切一段会把识别碎成 2-3 个词、
//   上下文太短识别质量差。故只用 vad.isDetected() 判说话/静音,front 一律不碰,队列只 pop 清空。
//
// 累计当前段语音到 curBuf;满足任一条件就把整段识别成 confirmed、开新段:
//   1) 累计语音 ≥ COMMIT_TARGET(~13s)→ 强制固化,对齐 Pass B 的上下文长度;
//   2) 静音 ≥ SILENCE_COMMIT(~0.7s)且当前段已攒够 MIN_COMMIT(~4s)→ 视作自然段落边界。
//   → 短于 0.7s 的微停顿不切,合并进同一段,上下文更长、识别更准。
// hypothesis = 说话进行中每 ~0.8s 重识别当前 curBuf,与 confirmed 同 segmentId → UI 原地替换不跳行
//   (spike-013)。SenseVoice int8 在 M 系 RTF≈0.016(spike-012),重识别 ≤13s 成本可忽略。

import type { LiveSegment } from '@shared/transcribe/streaming-protocol'

function int16ToFloat32(int16: Int16Array): Float32Array {
  const out = new Float32Array(int16.length)
  for (let i = 0; i < int16.length; i++) out[i] = (int16[i] ?? 0) / 32768
  return out
}

const SR = 16000
const VAD_WINDOW = 512
const HYP_INTERVAL_SAMPLES = Math.floor(SR * 0.8) // ~0.8s 出一次 hypothesis
const COMMIT_TARGET_SAMPLES = SR * 13 // 累计语音达 ~13s 强制固化(对齐 Pass B 上下文长度)
const SILENCE_COMMIT_SAMPLES = Math.floor(SR * 0.7) // 静音持续 ~0.7s 视作段落边界
const MIN_COMMIT_SAMPLES = SR * 4 // 段落边界固化的最小内容量(短停顿不切、合并上下文)

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

export class VadStream {
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
  ) {}

  private recog(samples: Float32Array): string {
    const s = this.rec.createStream()
    s.acceptWaveform({ samples, sampleRate: SR })
    this.rec.decode(s)
    return cleanText(this.rec.getResult(s).text ?? '')
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
    for (; i + VAD_WINDOW <= data.length; i += VAD_WINDOW) {
      const win = data.subarray(i, i + VAD_WINDOW)
      this.vad.acceptWaveform(win)
      this.totalSamples += VAD_WINDOW
      this.step(win)
    }
    this.leftover = data.slice(i)
    this.onProgress((this.totalSamples / SR) * 1000)
  }

  private step(win: Float32Array): void {
    if (this.vad.isDetected()) {
      this.silenceSamples = 0
      if (this.curId == null) {
        this.curId = `seg-${this.segCounter++}`
        this.curStartSample = this.totalSamples - VAD_WINDOW
        this.curBuf = []
        this.curSamples = 0
        this.lastHypSample = -Infinity
      }
      this.curBuf.push(win)
      this.curSamples += win.length
      if (this.curSamples >= COMMIT_TARGET_SAMPLES) {
        this.commit() // 累计够长 → 强制固化
      } else {
        this.maybeHypothesis()
      }
    } else if (this.curId != null) {
      // 静音:累计;够长 + 当前段已攒够内容 → 段落边界,固化
      this.silenceSamples += win.length
      if (this.silenceSamples >= SILENCE_COMMIT_SAMPLES && this.curSamples >= MIN_COMMIT_SAMPLES) {
        this.commit()
      }
    }
    // 不用 VAD 闭合段(front 是 external buffer),只 pop 清队列防原生侧无限堆积
    while (!this.vad.isEmpty()) this.vad.pop()
  }

  private maybeHypothesis(): void {
    if (this.curId == null) return
    if (this.totalSamples - this.lastHypSample < HYP_INTERVAL_SAMPLES) return
    this.lastHypSample = this.totalSamples
    const text = this.recog(concat(this.curBuf))
    if (text) {
      this.emit({
        segmentId: this.curId,
        start: this.curStartSample / SR,
        end: this.totalSamples / SR,
        text,
        speaker: this.speaker,
        stability: 'hypothesis',
      })
    }
  }

  /** 把当前段整段识别成 confirmed、开新段 */
  private commit(): void {
    if (this.curId == null || this.curSamples === 0) {
      this.resetCurrent()
      return
    }
    const text = this.recog(concat(this.curBuf))
    if (text) {
      this.emit({
        segmentId: this.curId,
        start: this.curStartSample / SR,
        end: this.totalSamples / SR,
        text,
        speaker: this.speaker,
        stability: 'confirmed',
      })
    }
    this.resetCurrent()
  }

  /** 录音 stop:把未固化的当前段识别落定 */
  flush(): void {
    this.commit()
  }
}
