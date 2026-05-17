// 包装 sherpa-onnx-node 的 readWave + 提供简单的 chunk 切片
// sherpa-onnx-node 的 readWave 直接吐 16k mono Float32(它内部 resample)
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const sherpa = require('sherpa-onnx-node') as {
  readWave(path: string): { samples: Float32Array; sampleRate: number }
}

export type Wave = { samples: Float32Array; sampleRate: number }

export function readWave(path: string): Wave {
  return sherpa.readWave(path)
}

// 把整段 PCM 切成固定长度 chunk(模拟 streaming 推流)
export function* iterateChunks(wave: Wave, chunkDurationMs: number): Generator<Float32Array> {
  const samplesPerChunk = Math.floor((wave.sampleRate * chunkDurationMs) / 1000)
  for (let i = 0; i < wave.samples.length; i += samplesPerChunk) {
    yield wave.samples.subarray(i, Math.min(i + samplesPerChunk, wave.samples.length))
  }
}

export function durationSeconds(wave: Wave): number {
  return wave.samples.length / wave.sampleRate
}
