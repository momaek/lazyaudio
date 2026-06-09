// T32 — SenseVoice 离线识别(Pass B)。
//
// SenseVoice 是 utterance 级非流式模型(训练片段 <30s),整段 30min 喂进去会 OOM/出乱码,必须切片。
//
// 两种切片:
//   - recognizeSamples(**默认**):无脑 ~15s 定窗。均匀窗给 SenseVoice 稳定上下文,密集语音上最稳。
//   - recognizeSamplesVad(实验,默认不启用):Silero VAD 在静音处切段。本想治「定窗边界吞字」,但
//     dogfood A/B 否决——CER +0.9(圆桌 +1.4/+2.2)。原因:漏转是模型层面(英文/音乐),非边界切的;
//     且 VAD 把多人轮替切成短段,上下文碎片化反伤 SenseVoice。保留作将来调参 / 静音多的会议录音实验,
//     生产不默认启用(orchestrator 不传 vadModelPath)。详见 tech-feasibility「Pass B VAD 分段实验」。

import path from 'node:path'
import { readWav16kMono } from './wav-read'
import type { AsrSegment } from '@shared/transcribe/asr-protocol'

const SAMPLE_RATE = 16000
const WINDOW_SEC = 15
const WINDOW_SAMPLES = SAMPLE_RATE * WINDOW_SEC

// VAD 分段参数(对齐 vad-stream.ts 的 Pass A 口径)
const VAD_WINDOW = 512 // Silero 固定窗
const COMMIT_TARGET_SAMPLES = SAMPLE_RATE * 13 // 累计语音 ~13s 强制固化
const SILENCE_COMMIT_SAMPLES = Math.floor(SAMPLE_RATE * 0.7) // 静音 ~0.7s 视作段落边界
const MIN_COMMIT_SAMPLES = SAMPLE_RATE * 4 // 段落边界固化的最小内容量(短停顿不切)

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
/** VAD 最小面:只用 isDetected() 做门控,绝不调 front()(返回 external buffer,Electron 会抛) */
export interface VadInstance {
  acceptWaveform(samples: Float32Array): void
  isDetected(): boolean
  isEmpty(): boolean
  pop(): void
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

/** 识别一段连续样本 → 文本(空文本返回 '')。samples 必须是独立连续 buffer,不能传 subarray view 给 native。 */
function recognizeBuffer(rec: OfflineRecognizer, samples: Float32Array): string {
  const stream = rec.createStream()
  stream.acceptWaveform({ samples, sampleRate: SAMPLE_RATE })
  rec.decode(stream)
  return cleanText(rec.getResult(stream).text ?? '')
}

/** 兜底:无脑 15s 定窗识别整段样本 → segments(空文本窗跳过)。边界会切断词、漏字,仅 VAD 不可用时用。 */
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
    const text = recognizeBuffer(rec, new Float32Array(samples.subarray(start, end)))
    if (text) {
      segments.push({ start: start / SAMPLE_RATE, end: end / SAMPLE_RATE, text })
    }
    onProgress(end / SAMPLE_RATE, totalSec)
  }
  return segments
}

/**
 * VAD 分段识别(实验,默认不启用 —— A/B 显示回退 CER,见文件头注)。Silero VAD 只用 isDetected()
 * 门控,分段全在 JS 按「累计语音时长 + 真实停顿」做(不碰 front(),它返回 external buffer 会崩)。
 *
 * 累计当前段语音到 curStart..curEnd;满足任一固化:
 *   1) 累计语音 ≥ COMMIT_TARGET(~13s)→ 强制切(长无停顿语段兜底);
 *   2) 静音 ≥ SILENCE_COMMIT(~0.7s)且当前段已攒够 MIN_COMMIT(~4s)→ 自然段落边界。
 * 段时间戳取真实语音区间(裁掉尾部静音)。非语音区(静音 / 音乐)不送模型 → 不产生乱码段。
 */
export function recognizeSamplesVad(
  rec: OfflineRecognizer,
  vad: VadInstance,
  samples: Float32Array,
  onProgress: (processedSec: number, totalSec: number) => void,
): AsrSegment[] {
  const total = samples.length
  const totalSec = total / SAMPLE_RATE
  const segments: AsrSegment[] = []

  let curStart = -1 // 当前段首样本(含)
  let curEnd = -1 // 当前段末样本(不含),只在有语音时推进 → 自动裁尾部静音
  let speechSamples = 0 // 当前段累计语音量(不含中间短停顿),对齐 COMMIT_TARGET/MIN_COMMIT 口径
  let silenceSamples = 0
  let lastProgress = 0

  const commit = (): void => {
    if (curStart >= 0 && curEnd > curStart) {
      const text = recognizeBuffer(rec, new Float32Array(samples.subarray(curStart, curEnd)))
      if (text) segments.push({ start: curStart / SAMPLE_RATE, end: curEnd / SAMPLE_RATE, text })
    }
    curStart = -1
    curEnd = -1
    speechSamples = 0
    silenceSamples = 0
  }

  for (let pos = 0; pos + VAD_WINDOW <= total; pos += VAD_WINDOW) {
    vad.acceptWaveform(samples.subarray(pos, pos + VAD_WINDOW))
    const speaking = vad.isDetected()
    while (!vad.isEmpty()) vad.pop() // 只清队列,不读 front()

    if (speaking) {
      silenceSamples = 0
      if (curStart < 0) curStart = pos
      speechSamples += VAD_WINDOW
      curEnd = pos + VAD_WINDOW
      if (speechSamples >= COMMIT_TARGET_SAMPLES) commit()
    } else if (curStart >= 0) {
      silenceSamples += VAD_WINDOW
      if (silenceSamples >= SILENCE_COMMIT_SAMPLES && speechSamples >= MIN_COMMIT_SAMPLES) commit()
    }

    // 限流上报进度(每 ~1s)
    if (pos - lastProgress >= SAMPLE_RATE) {
      lastProgress = pos
      onProgress(pos / SAMPLE_RATE, totalSec)
    }
  }
  commit() // 落定尾段
  onProgress(totalSec, totalSec)
  return segments
}

export { readWav16kMono }
