// T34 — 实时音频 DSP(纯函数,主进程 PCM fork + 流式 utility 共用)。
// 与 workers/asr/wav-read.ts 的下混/重采样同套路,但作用于内存 Int16/Float32 块。

/** 交错多声道 Int16 → 单声道 Float32([-1,1]),下混=各声道平均 */
export function int16ToMonoFloat32(int16: Int16Array, channels: number): Float32Array {
  if (channels <= 1) {
    const out = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) out[i] = (int16[i] ?? 0) / 32768
    return out
  }
  const frames = Math.floor(int16.length / channels)
  const out = new Float32Array(frames)
  let p = 0
  for (let i = 0; i < frames; i++) {
    let sum = 0
    for (let c = 0; c < channels; c++) sum += int16[p++] ?? 0
    out[i] = sum / channels / 32768
  }
  return out
}

/** 线性重采样 */
export function resampleLinear(
  input: Float32Array,
  srcRate: number,
  targetRate: number,
): Float32Array {
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

/** Float32([-1,1]) → Int16(裁剪) */
export function float32ToInt16(f32: Float32Array): Int16Array {
  const out = new Int16Array(f32.length)
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i] ?? 0))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

export function int16ToFloat32(int16: Int16Array): Float32Array {
  const out = new Float32Array(int16.length)
  for (let i = 0; i < int16.length; i++) out[i] = (int16[i] ?? 0) / 32768
  return out
}
