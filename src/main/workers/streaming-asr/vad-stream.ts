// T34 — Pass A 实时引擎核心:Silero VAD 切片 + SenseVoice 离线短窗(ADR-0004)。
//
// 喂 16k mono Float32 → VAD。confirmed = VAD 闭合段(front/pop)整段识别;
// hypothesis = 说话进行中每 ~0.8s 对尾部缓冲(上限 15s)识别一次,与 confirmed 同 segmentId
//   → UI 原地替换不跳行(spike-013)。
// POC 实测:hypothesis 重识别整段会把 RTF 推到 ~0.36;故 hypothesis 限尾部 15s 滑窗 + 0.8s 间隔。

import type { LiveSegment } from '@shared/transcribe/streaming-protocol'

function int16ToFloat32(int16: Int16Array): Float32Array {
  const out = new Float32Array(int16.length)
  for (let i = 0; i < int16.length; i++) out[i] = (int16[i] ?? 0) / 32768
  return out
}

const SR = 16000
const VAD_WINDOW = 512
const HYP_INTERVAL_SAMPLES = Math.floor(SR * 0.8) // ~0.8s 出一次 hypothesis
const HYP_MAX_TRAIL_SAMPLES = SR * 15 // hypothesis 只识别尾部 15s,控成本

interface OfflineStream {
  acceptWaveform(obj: { samples: Float32Array; sampleRate: number }): void
}
export interface Recognizer {
  createStream(): OfflineStream
  decode(s: OfflineStream): void
  getResult(s: OfflineStream): { text?: string }
}
export interface SpeechSegment {
  samples: Float32Array
  start: number // 样本下标
}
export interface VadInstance {
  acceptWaveform(samples: Float32Array): void
  isEmpty(): boolean
  isDetected(): boolean
  front(): SpeechSegment
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

  /** 喂一块 16k mono Int16 */
  pushInt16(int16: Int16Array): void {
    let data = int16ToFloat32(int16)
    if (this.leftover.length > 0) data = concat([this.leftover, data])

    let i = 0
    for (; i + VAD_WINDOW <= data.length; i += VAD_WINDOW) {
      const win = data.subarray(i, i + VAD_WINDOW)
      this.vad.acceptWaveform(win)
      this.totalSamples += VAD_WINDOW
      this.drainConfirmed()
      this.maybeHypothesis(win)
    }
    this.leftover = data.slice(i)
    this.onProgress((this.totalSamples / SR) * 1000)
  }

  private drainConfirmed(): void {
    while (!this.vad.isEmpty()) {
      const seg = this.vad.front()
      this.vad.pop()
      const text = this.recog(seg.samples)
      const id = this.curId ?? `seg-${this.segCounter++}`
      if (text) {
        this.emit({
          segmentId: id,
          start: seg.start / SR,
          end: (seg.start + seg.samples.length) / SR,
          text,
          speaker: this.speaker,
          stability: 'confirmed',
        })
      }
      // 复位当前段
      this.curId = null
      this.curStartSample = -1
      this.curBuf = []
    }
  }

  private maybeHypothesis(win: Float32Array): void {
    if (!this.vad.isDetected()) return
    if (this.curId == null) {
      this.curId = `seg-${this.segCounter++}`
      this.curStartSample = this.totalSamples - VAD_WINDOW
      this.curBuf = []
      this.lastHypSample = -Infinity
    }
    this.curBuf.push(win)
    if (this.totalSamples - this.lastHypSample < HYP_INTERVAL_SAMPLES) return
    this.lastHypSample = this.totalSamples

    const merged = concat(this.curBuf)
    const tail =
      merged.length > HYP_MAX_TRAIL_SAMPLES
        ? merged.subarray(merged.length - HYP_MAX_TRAIL_SAMPLES)
        : merged
    const text = this.recog(tail)
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

  /** 录音 stop:flush VAD 残留段并识别 */
  flush(): void {
    this.vad.flush()
    this.drainConfirmed()
  }
}
