// ASR utility process ↔ 主进程的消息协议(走 utilityProcess 的 parentPort,ADR-0003)。
// 纯类型 + 常量,无运行时依赖:main / utility / test 三处共用,避免散落的字面量字符串。
//
// T30 最小版只覆盖「加载链握手」:main fork utility → init → utility require('sherpa-onnx-node')
// → ready / fatal。真实识别消息(喂 PCM、出 transcript)在 T32 扩展。

/** main → utility:fork 后的第一条消息,必须是 init(否则 utility 回 protocol-error) */
export interface AsrInitMessage {
  type: 'init'
  // sherpa-onnx 平台子包目录(含 .node + 平台二进制)。由主进程用 app.isPackaged +
  // resourcesPath 算好传入,**不**靠 utility 的 __dirname 反推(utility 里 app 不可用,
  // 且反推强依赖源码目录结构,重构即断 —— transcription-pipeline §3.2.1)。
  platformDir: string
}

/** main → utility:让 utility 跑一次离线转录(T32 Pass B)。
 *  utility 加载 SenseVoice recognizer、读 wav、定窗切片识别,回 transcribe-result / -error。 */
export interface AsrTranscribeMessage {
  type: 'transcribe'
  recordingId: string
  /** 要转录的 wav 绝对路径(主进程挑好:mixed > mic > system) */
  wavPath: string
  /** 模型目录绝对路径(含 model.int8.onnx + tokens.txt) */
  modelDir: string
  modelKey: string
  /** 'auto' | 'zh' | 'en' | ...;v0.1 用 auto */
  language: string
  /** 该 wav 对应的 speaker 标签:'mic' | 'system' | 'mixed' */
  speaker: string
  /** silero_vad.onnx 绝对路径。给了就走 VAD 分段(治定窗边界吞字,dev-plan §6.2.3 P0 #1);
   *  缺省则回退定窗 15s 切片(max-duration 兜底)。 */
  vadModelPath?: string
}

/** utility 识别出的单段(start/end 秒) */
export interface AsrSegment {
  start: number
  end: number
  text: string
}

/** main → utility */
export type AsrRequestMessage = AsrInitMessage | AsrTranscribeMessage

/** utility → main */
export type AsrUtilityMessage =
  | { type: 'ready'; sherpaVersion: string } // require('sherpa-onnx-node') 成功
  | { type: 'fatal'; code: AsrFatalCode; detail?: unknown }
  | { type: 'transcribe-progress'; recordingId: string; processedSec: number; totalSec: number }
  | {
      type: 'transcribe-result'
      recordingId: string
      segments: AsrSegment[]
      language: string
      speaker: string
      durationMs: number
    }
  | { type: 'transcribe-error'; recordingId: string; code: AsrTranscribeErrorCode; message: string }

export type AsrFatalCode =
  | 'protocol-error' // 第一条不是 init
  | 'sherpa-dylib-missing' // platformDir 缺 .node / 平台二进制
  | 'sherpa-require-failed' // require 抛错(dylib 链断 / addon 不兼容等)

export type AsrTranscribeErrorCode =
  | 'model-load-failed' // OfflineRecognizer 构造失败(模型文件缺/坏)
  | 'wav-read-failed' // wav 读取/解析失败
  | 'recognize-failed' // 识别过程抛错
