// T34 — Pass A 实时转录 utility ↔ 主进程消息协议(走 utilityProcess parentPort)。
// 对齐 ipc-contract.md §3 streaming-utility 协议。纯类型,无运行时依赖。

import type { AsrFatalCode } from './asr-protocol'

/** main → streaming utility */
export type StreamingTask =
  | {
      type: 'init'
      platformDir: string // sherpa 平台子包目录(含 .node)
      modelDir: string // SenseVoice 模型目录(model.int8.onnx + tokens.txt)
      vadModelPath: string // silero_vad.onnx 绝对路径
      recordingId: string
      language: string // 'auto'
      speaker: string // v0.1 合一路 'mixed'
      // 进程回收续接(T61 OfflineStream 泄漏:长录音中途换 worker 释放原生内存)。
      // 新 worker 从上次 confirmed 水位续:段号 / 时间戳偏移,保证 segmentId 不撞、时间轴连续。
      segCounterOffset?: number // 下一个 seg-N 的 N(= 上次最后 confirmed 段号 + 1)
      sampleOffset?: number // 起始累计样本数(= 上次最后 confirmed 段 end × 16000)
    }
  | { type: 'pcm'; recordingId: string; pcm: ArrayBuffer } // 16k mono Int16(transferable)
  | { type: 'stop'; recordingId: string } // 录音 stop → flush 最后段 → 退出

/** 实时段事件 */
export interface LiveSegment {
  segmentId: string // 引擎分配,每次说话起点 +1;hypothesis→confirmed 同 id
  start: number // 秒
  end: number
  text: string
  speaker: string
  stability: 'hypothesis' | 'confirmed'
}

/** T61 — Pass A 安全 debug 指标:不带正文,只用于中英混合/短窗 A/B。 */
export interface LiveRecognitionDebug {
  segmentId: string
  stability: 'hypothesis' | 'confirmed'
  audioMs: number
  recognizeMs: number
  rawTags: string[]
  cleanChars: number
}

/** streaming utility → main */
export type StreamingEvent =
  | { type: 'ready'; sherpaVersion: string }
  | { type: 'fatal'; code: AsrFatalCode; detail?: unknown }
  | { type: 'segment'; recordingId: string; segment: LiveSegment }
  | { type: 'progress'; recordingId: string; processedMs: number }
  | { type: 'debug'; recordingId: string; debug: LiveRecognitionDebug }
  | { type: 'flushed'; recordingId: string } // 收到 stop 后 flush 完毕,准备退出
  | { type: 'recycle-needed'; recordingId: string; rssMb: number } // RSS 超阈值,请 main 在段边界换 worker
  | { type: 'error'; recordingId: string; message: string }
