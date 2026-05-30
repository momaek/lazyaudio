// T32 — wav-read 单测:RIFF 解析 + stereo 下混 + 48k→16k 重采样。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { readWav16kMono } from '../../../src/main/workers/asr/wav-read'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lazyaudio-wav-'))
})
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

/** 合成一个 s16le WAV(给定声道/采样率/每帧样本值数组) */
function makeWav(opts: {
  channels: number
  sampleRate: number
  framesPerChannel: number[][] // [frame][channel] int16
}): Buffer {
  const { channels, sampleRate, framesPerChannel } = opts
  const frames = framesPerChannel.length
  const dataBytes = frames * channels * 2
  const buf = Buffer.alloc(44 + dataBytes)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataBytes, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(channels, 22)
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * channels * 2, 28)
  buf.writeUInt16LE(channels * 2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataBytes, 40)
  let p = 44
  for (const frame of framesPerChannel) {
    for (let c = 0; c < channels; c++) {
      buf.writeInt16LE(frame[c] ?? 0, p)
      p += 2
    }
  }
  return buf
}

describe('readWav16kMono', () => {
  it('16k mono:原样读出,样本数不变,值归一到 [-1,1]', async () => {
    const p = path.join(tmpDir, 'a.wav')
    await fs.writeFile(
      p,
      makeWav({ channels: 1, sampleRate: 16000, framesPerChannel: [[16384], [-16384], [0]] }),
    )
    const { samples, sampleRate } = readWav16kMono(p)
    expect(sampleRate).toBe(16000)
    expect(samples.length).toBe(3)
    expect(samples[0]).toBeCloseTo(0.5, 3)
    expect(samples[1]).toBeCloseTo(-0.5, 3)
  })

  it('stereo 下混=两声道平均', async () => {
    const p = path.join(tmpDir, 'b.wav')
    await fs.writeFile(
      p,
      makeWav({
        channels: 2,
        sampleRate: 16000,
        framesPerChannel: [
          [16384, 0], // 平均 = 8192 → ~0.25
          [32767, -32768], // 平均 ≈ 0
        ],
      }),
    )
    const { samples } = readWav16kMono(p)
    expect(samples.length).toBe(2)
    expect(samples[0]!).toBeCloseTo(0.25, 2)
    expect(Math.abs(samples[1]!)).toBeLessThan(0.01)
  })

  it('48k → 16k:样本数约为 1/3', async () => {
    const p = path.join(tmpDir, 'c.wav')
    const frames = Array.from({ length: 480 }, () => [1000])
    await fs.writeFile(p, makeWav({ channels: 1, sampleRate: 48000, framesPerChannel: frames }))
    const { samples, sampleRate } = readWav16kMono(p)
    expect(sampleRate).toBe(16000)
    expect(samples.length).toBe(160) // 480 * (16000/48000)
  })

  it('非 RIFF 抛错', async () => {
    const p = path.join(tmpDir, 'bad.wav')
    await fs.writeFile(p, Buffer.from('not a wav file at all............'))
    expect(() => readWav16kMono(p)).toThrow()
  })
})
