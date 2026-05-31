// T34 — dsp 单测:Int16 下混 / 线性重采样 / Float32→Int16。
import { describe, it, expect } from 'vitest'
import { int16ToMonoFloat32, resampleLinear, float32ToInt16 } from '../../../src/main/audio/dsp'

describe('dsp', () => {
  it('int16ToMonoFloat32:单声道原样归一', () => {
    const out = int16ToMonoFloat32(Int16Array.from([16384, -16384, 0]), 1)
    expect(out[0]).toBeCloseTo(0.5, 3)
    expect(out[1]).toBeCloseTo(-0.5, 3)
    expect(out[2]).toBe(0)
  })

  it('int16ToMonoFloat32:双声道交错下混=平均', () => {
    // 帧0: [16384, 0] → 0.25;帧1: [32767,-32768] → ~0
    const out = int16ToMonoFloat32(Int16Array.from([16384, 0, 32767, -32768]), 2)
    expect(out.length).toBe(2)
    expect(out[0]!).toBeCloseTo(0.25, 2)
    expect(Math.abs(out[1]!)).toBeLessThan(0.01)
  })

  it('resampleLinear:48k→16k 长度约 1/3', () => {
    const input = new Float32Array(480).fill(0.5)
    const out = resampleLinear(input, 48000, 16000)
    expect(out.length).toBe(160)
    expect(out[10]).toBeCloseTo(0.5, 3)
  })

  it('resampleLinear:同采样率原样返回', () => {
    const input = new Float32Array([0.1, 0.2])
    expect(resampleLinear(input, 16000, 16000)).toBe(input)
  })

  it('float32ToInt16:裁剪 + 量化', () => {
    const out = float32ToInt16(new Float32Array([0.5, -0.5, 2, -2]))
    expect(out[0]).toBeCloseTo(16383, -1)
    expect(out[1]).toBeCloseTo(-16384, -1)
    expect(out[2]).toBe(32767) // 裁到 +1
    expect(out[3]).toBe(-32768) // 裁到 -1
  })
})
