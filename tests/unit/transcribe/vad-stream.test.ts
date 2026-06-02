// T34/T35 — VadStream 单测:JS 分段(累计时长 + 真实停顿),hypothesis→confirmed 同 segmentId
// (原地替换不跳行,spike-013)。只用 vad.isDetected() 门控,绝不调 front()(external buffer 会崩)。
import { describe, it, expect } from 'vitest'
import { VadStream, type VadInstance } from '../../../src/main/workers/streaming-asr/vad-stream'
import type { LiveSegment } from '@shared/transcribe/streaming-protocol'

class MockVad implements VadInstance {
  detected = false
  acceptWaveform(): void {}
  isDetected(): boolean {
    return this.detected
  }
  isEmpty(): boolean {
    return true // 我们不读 VAD 队列
  }
  pop(): void {}
  flush(): void {}
  // 回归守卫:新实现绝不应调用 front()(sherpa 返回 external buffer,Electron 会抛)
  front(): never {
    throw new Error('front() must not be called')
  }
}

const mockRec = {
  createStream: () => ({ acceptWaveform: (): void => {} }),
  decode: (): void => {},
  getResult: () => ({ text: '识别文本' }),
}

function newStream(emitted: LiveSegment[], vad: MockVad): VadStream {
  return new VadStream(
    mockRec,
    vad,
    'mixed',
    (s) => emitted.push(s),
    () => {},
  )
}

/** 喂 n 秒(每秒一块 16k),detected 由调用方先设好 */
function feed(vs: VadStream, sec: number): void {
  for (let i = 0; i < sec; i++) vs.pushInt16(new Int16Array(16000))
}

describe('VadStream', () => {
  it('说话中出 hypothesis、同段共享 segmentId;静音段落边界出 confirmed 同 id', () => {
    const emitted: LiveSegment[] = []
    const vad = new MockVad()
    const vs = newStream(emitted, vad)

    vad.detected = true
    feed(vs, 5) // 说 5s(≥ MIN_COMMIT 4s)

    const hyps = emitted.filter((e) => e.stability === 'hypothesis')
    expect(hyps.length).toBeGreaterThanOrEqual(2)
    const id = hyps[0]!.segmentId
    expect(hyps.every((h) => h.segmentId === id)).toBe(true)

    // 静音 ~1s(≥ SILENCE_COMMIT 0.7s)→ 固化,复用同 id
    vad.detected = false
    feed(vs, 1)

    const confs = emitted.filter((e) => e.stability === 'confirmed')
    expect(confs.length).toBe(1)
    expect(confs[0]!.segmentId).toBe(id)
    expect(confs[0]!.start).toBe(0)
  })

  it('累计语音达 ~13s → 强制固化(不必等停顿)', () => {
    const emitted: LiveSegment[] = []
    const vad = new MockVad()
    const vs = newStream(emitted, vad)

    vad.detected = true
    feed(vs, 14) // 连续说 14s,无停顿

    const confs = emitted.filter((e) => e.stability === 'confirmed')
    expect(confs.length).toBe(1) // 在 ~13s 处固化一段
    expect(confs[0]!.start).toBe(0)
  })

  it('短停顿(内容不足)不切段,合并进同一段', () => {
    const emitted: LiveSegment[] = []
    const vad = new MockVad()
    const vs = newStream(emitted, vad)

    vad.detected = true
    feed(vs, 2) // 说 2s(< MIN_COMMIT)
    vad.detected = false
    feed(vs, 1) // 停 1s → 内容不足,不固化(合并)
    expect(emitted.filter((e) => e.stability === 'confirmed').length).toBe(0)

    vad.detected = true
    feed(vs, 3) // 再说 3s → 累计 5s
    vad.detected = false
    feed(vs, 1) // 停 1s → 段落边界,固化一段

    const confs = emitted.filter((e) => e.stability === 'confirmed')
    expect(confs.length).toBe(1) // 合并成一段,而非碎成两段
  })

  it('flush 把未固化的当前段识别落定', () => {
    const emitted: LiveSegment[] = []
    const vad = new MockVad()
    const vs = newStream(emitted, vad)

    vad.detected = true
    feed(vs, 5) // 说 5s,未达 13s、未遇停顿
    expect(emitted.filter((e) => e.stability === 'confirmed').length).toBe(0)

    vs.flush()
    expect(emitted.filter((e) => e.stability === 'confirmed').length).toBe(1)
  })

  it('全程不调用 vad.front()(回归:external buffer 崩溃)', () => {
    const emitted: LiveSegment[] = []
    const vad = new MockVad()
    const vs = newStream(emitted, vad)
    expect(() => {
      vad.detected = true
      feed(vs, 6)
      vad.detected = false
      feed(vs, 2)
      vs.flush()
    }).not.toThrow()
    expect(emitted.filter((e) => e.stability === 'confirmed').length).toBeGreaterThanOrEqual(1)
  })
})
