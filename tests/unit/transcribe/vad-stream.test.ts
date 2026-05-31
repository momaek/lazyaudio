// T34/T35 — VadStream 单测:hypothesis→confirmed 同 segmentId(原地替换不跳行,spike-013)。
// mock VAD(可控 isDetected / 段队列)+ mock recognizer。
import { describe, it, expect } from 'vitest'
import {
  VadStream,
  type VadInstance,
  type SpeechSegment,
} from '../../../src/main/workers/streaming-asr/vad-stream'
import type { LiveSegment } from '@shared/transcribe/streaming-protocol'

class MockVad implements VadInstance {
  detected = false
  queue: SpeechSegment[] = []
  acceptWaveform(): void {}
  isDetected(): boolean {
    return this.detected
  }
  isEmpty(): boolean {
    return this.queue.length === 0
  }
  front(): SpeechSegment {
    return this.queue[0]!
  }
  pop(): void {
    this.queue.shift()
  }
  flush(): void {}
}

const mockRec = {
  createStream: () => ({ acceptWaveform: (): void => {} }),
  decode: (): void => {},
  getResult: () => ({ text: '识别文本' }),
}

describe('VadStream', () => {
  it('说话中出 hypothesis,同一段共享 segmentId;VAD 闭合段出 confirmed 同 id', () => {
    const emitted: LiveSegment[] = []
    const vad = new MockVad()
    const vs = new VadStream(
      mockRec,
      vad,
      'mixed',
      (s) => emitted.push(s),
      () => {},
    )

    // 阶段1:说话中,喂 ~2s → 多个 hypothesis(0.8s 间隔)
    vad.detected = true
    vs.pushInt16(new Int16Array(16000)) // 1s
    vs.pushInt16(new Int16Array(16000)) // 再 1s

    const hyps = emitted.filter((e) => e.stability === 'hypothesis')
    expect(hyps.length).toBeGreaterThanOrEqual(2)
    const id = hyps[0]!.segmentId
    expect(hyps.every((h) => h.segmentId === id)).toBe(true) // 同 id

    // 阶段2:静音 + VAD 吐出闭合段 → confirmed,同 id
    vad.detected = false
    vad.queue.push({ samples: new Float32Array(8000), start: 0 })
    vs.pushInt16(new Int16Array(512))

    const confs = emitted.filter((e) => e.stability === 'confirmed')
    expect(confs.length).toBe(1)
    expect(confs[0]!.segmentId).toBe(id) // 关键:confirmed 复用 hypothesis 的 id
  })

  it('flush 把残留闭合段识别为 confirmed', () => {
    const emitted: LiveSegment[] = []
    const vad = new MockVad()
    const vs = new VadStream(
      mockRec,
      vad,
      'mixed',
      (s) => emitted.push(s),
      () => {},
    )
    vad.queue.push({ samples: new Float32Array(4000), start: 16000 })
    vs.flush()
    const confs = emitted.filter((e) => e.stability === 'confirmed')
    expect(confs.length).toBe(1)
    expect(confs[0]!.start).toBe(1) // 16000/16000
  })
})
