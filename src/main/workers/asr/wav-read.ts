// T32 — utility 进程内读 wav → 16k mono Float32(喂 SenseVoice)。
//
// 录音 wav 是 48k stereo s16le(T13 writer 格式)。SenseVoice 要 16k mono。
// 自己解析 RIFF 头(不靠 sherpa readWave,避免它对 stereo/采样率的隐式处理)+ 下混 + 线性重采样。

import fs from 'node:fs'

export interface DecodedWav {
  /** [-1,1] 的单声道样本 */
  samples: Float32Array
  sampleRate: number
}

interface WavFormat {
  channels: number
  sampleRate: number
  bitsPerSample: number
  dataOffset: number
  dataSize: number
}

function parseHeader(buf: Buffer): WavFormat {
  if (
    buf.length < 44 ||
    buf.toString('ascii', 0, 4) !== 'RIFF' ||
    buf.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new Error('not a RIFF/WAVE file')
  }
  let offset = 12
  let fmt: { channels: number; sampleRate: number; bitsPerSample: number } | null = null
  let dataOffset = -1
  let dataSize = 0
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4)
    const size = buf.readUInt32LE(offset + 4)
    const body = offset + 8
    if (id === 'fmt ') {
      fmt = {
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bitsPerSample: buf.readUInt16LE(body + 14),
      }
    } else if (id === 'data') {
      dataOffset = body
      // header 里的 size 在未正常 close 时可能不准,用真实文件长度兜底
      dataSize = Math.min(size, buf.length - body)
      break
    }
    offset = body + size + (size % 2) // chunk 2 字节对齐
  }
  if (!fmt) throw new Error('missing fmt chunk')
  if (dataOffset < 0) throw new Error('missing data chunk')
  if (fmt.bitsPerSample !== 16) throw new Error(`unsupported bitsPerSample ${fmt.bitsPerSample}`)
  return { ...fmt, dataOffset, dataSize }
}

/** s16le 多声道 → mono Float32([-1,1]),下混=各声道平均 */
function toMonoFloat32(buf: Buffer, fmt: WavFormat): Float32Array {
  const bytesPerSample = 2
  const frameBytes = bytesPerSample * fmt.channels
  const frames = Math.floor(fmt.dataSize / frameBytes)
  const out = new Float32Array(frames)
  let p = fmt.dataOffset
  for (let i = 0; i < frames; i++) {
    let sum = 0
    for (let c = 0; c < fmt.channels; c++) {
      sum += buf.readInt16LE(p)
      p += bytesPerSample
    }
    out[i] = sum / fmt.channels / 32768
  }
  return out
}

/** 线性重采样到 targetRate */
function resample(input: Float32Array, srcRate: number, targetRate: number): Float32Array {
  if (srcRate === targetRate) return input
  const ratio = targetRate / srcRate
  const outLen = Math.max(0, Math.floor(input.length * ratio))
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const srcPos = i / ratio
    const i0 = Math.floor(srcPos)
    const i1 = Math.min(i0 + 1, input.length - 1)
    const frac = srcPos - i0
    out[i] = (input[i0] ?? 0) * (1 - frac) + (input[i1] ?? 0) * frac
  }
  return out
}

/** 读 wav → 16k mono Float32 */
export function readWav16kMono(wavPath: string, targetRate = 16000): DecodedWav {
  const buf = fs.readFileSync(wavPath)
  const fmt = parseHeader(buf)
  const mono = toMonoFloat32(buf, fmt)
  const samples = resample(mono, fmt.sampleRate, targetRate)
  return { samples, sampleRate: targetRate }
}
