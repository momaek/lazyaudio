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

/** utility → main */
export type AsrUtilityMessage =
  | { type: 'ready'; sherpaVersion: string } // require('sherpa-onnx-node') 成功
  | { type: 'fatal'; code: AsrFatalCode; detail?: unknown }

export type AsrFatalCode =
  | 'protocol-error' // 第一条不是 init
  | 'sherpa-dylib-missing' // platformDir 缺 .node / 平台二进制
  | 'sherpa-require-failed' // require 抛错(dylib 链断 / addon 不兼容等)
