import { describe, expect, it } from 'vitest'
import { parseWavHeader } from '../../../src/main/recording/wav-recovery'

function makeHeader(opts: { dataSize: number; sampleRate?: number; channels?: number }): Buffer {
  const sampleRate = opts.sampleRate ?? 48_000
  const channels = opts.channels ?? 1
  const bitDepth = 16
  const buf = Buffer.alloc(44)
  const byteRate = sampleRate * channels * (bitDepth / 8)
  const blockAlign = channels * (bitDepth / 8)
  buf.write('RIFF', 0, 4, 'ascii')
  buf.writeUInt32LE(36 + opts.dataSize, 4)
  buf.write('WAVE', 8, 4, 'ascii')
  buf.write('fmt ', 12, 4, 'ascii')
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(channels, 22)
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(byteRate, 28)
  buf.writeUInt16LE(blockAlign, 32)
  buf.writeUInt16LE(bitDepth, 34)
  buf.write('data', 36, 4, 'ascii')
  buf.writeUInt32LE(opts.dataSize, 40)
  return buf
}

describe('wav recovery', () => {
  it('uses actual file size instead of stale header data size', () => {
    const staleHeader = makeHeader({ dataSize: 0, channels: 1 })
    const info = parseWavHeader(staleHeader, 44 + 96_000)

    expect(info).toEqual({
      sampleRate: 48_000,
      channels: 1,
      bitDepth: 16,
      dataBytes: 96_000,
      durationMs: 1000,
    })
  })

  it('trims incomplete trailing frame bytes', () => {
    const header = makeHeader({ dataSize: 0, channels: 2 })
    const info = parseWavHeader(header, 44 + 96_003)

    expect(info?.dataBytes).toBe(96_000)
  })
})
