// T32 — SenseVoice 离线识别(定窗切片)。
//
// SenseVoice 是 utterance 级非流式模型(训练片段 <30s),整段 30min 喂进去会 OOM/出乱码。
// v0.1 简化:按 ~15s 定窗切片,逐窗识别,窗位置即段时间戳。
// (VAD 短窗分段是后续优化 —— 与 T34 Pass A 引入 VAD 一起做,见 ADR-0004。)

import path from 'node:path'
import { readWav16kMono } from './wav-read'
import type { AsrSegment } from '@shared/transcribe/asr-protocol'

const SAMPLE_RATE = 16000
const WINDOW_SEC = 15
const WINDOW_SAMPLES = SAMPLE_RATE * WINDOW_SEC

// sherpa-onnx-node 无类型声明;只声明我们用到的最小面
interface OfflineStream {
  acceptWaveform(obj: { samples: Float32Array; sampleRate: number }): void
}
interface OfflineRecognizer {
  createStream(): OfflineStream
  decode(stream: OfflineStream): void
  getResult(stream: OfflineStream): { text?: string }
}
export interface SherpaModule {
  OfflineRecognizer: new (config: unknown) => OfflineRecognizer
}

const recognizers = new Map<string, OfflineRecognizer>()

/** 构造(或复用)SenseVoice recognizer。抛错 = 模型文件缺/坏 → model-load-failed。 */
export function loadRecognizer(
  sherpa: SherpaModule,
  modelDir: string,
  language: string,
): OfflineRecognizer {
  const key = `${modelDir}|${language}`
  const cached = recognizers.get(key)
  if (cached) return cached
  const rec = new sherpa.OfflineRecognizer({
    modelConfig: {
      senseVoice: {
        model: path.join(modelDir, 'model.int8.onnx'),
        language,
        useInverseTextNormalization: 1,
      },
      tokens: path.join(modelDir, 'tokens.txt'),
      numThreads: 2,
      provider: 'cpu',
      debug: 0,
    },
  })
  recognizers.set(key, rec)
  return rec
}

/** SenseVoice 偶发在 text 里夹 `<|lang|><|EMO|>` 之类特殊标记,去掉 + trim */
function cleanText(text: string): string {
  return text.replace(/<\|[^|]*\|>/g, '').trim()
}

/** 定窗识别整段样本 → segments(空文本窗跳过)。onProgress(已处理秒, 总秒)。 */
export function recognizeSamples(
  rec: OfflineRecognizer,
  samples: Float32Array,
  onProgress: (processedSec: number, totalSec: number) => void,
): AsrSegment[] {
  const total = samples.length
  const totalSec = total / SAMPLE_RATE
  const segments: AsrSegment[] = []
  for (let start = 0; start < total; start += WINDOW_SAMPLES) {
    const end = Math.min(start + WINDOW_SAMPLES, total)
    // copy 成独立连续 buffer(避免把 subarray view 传给 native addon)
    const window = new Float32Array(samples.subarray(start, end))
    const stream = rec.createStream()
    stream.acceptWaveform({ samples: window, sampleRate: SAMPLE_RATE })
    rec.decode(stream)
    const result = rec.getResult(stream)
    const text = cleanText(result.text ?? '')
    if (text) {
      segments.push({ start: start / SAMPLE_RATE, end: end / SAMPLE_RATE, text })
    }
    onProgress(end / SAMPLE_RATE, totalSec)
  }
  return segments
}

export { readWav16kMono }
