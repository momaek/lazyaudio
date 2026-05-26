// preload 通过 contextBridge 暴露给 renderer 的 API 接口。
// renderer 在 src/renderer/global.d.ts 把 window.lazyaudio: LazyAudioApi 注册成全局类型。

import type { PingResult } from '../ipc/system'
import type { PrepDefaults, StartArgs, StartResult, HidePrepResult } from '../ipc/record'
import type { ListResult } from '../ipc/library'
import type { StartCaptureArgs, StopCaptureArgs, CaptureFailedArgs } from '../audio/messages'

export interface LazyAudioApi {
  system: {
    ping(): Promise<PingResult>
  }
  record: {
    /** prep 浮窗 mount 时拉默认 sessionType + sources */
    getPrepDefaults(): Promise<PrepDefaults>
    /** 用户在 prep 浮窗点"开始录音"/Enter 时调;T12 起接录音状态机 + 触发 capture */
    start(args: StartArgs): Promise<StartResult>
    /** 用户主动 / shortcut 双向触发停录音(T12) */
    stop(): Promise<{ ok: boolean }>
    /** 取消按钮 / Esc 通知 main 隐藏 prep 浮窗 */
    hidePrep(): Promise<HidePrepResult>
  }
  library: {
    /** T15 录音库 v0.1:按日期分组返回 recordings 下的 meta 快照 */
    list(): Promise<ListResult>
  }
  audio: {
    /** capture window 订阅:main 发"启 capture"信令(T12) */
    onStartCapture(cb: (args: StartCaptureArgs) => void): () => void
    /** capture window 订阅:main 发"停 capture"信令(T12) */
    onStopCapture(cb: (args: StopCaptureArgs) => void): () => void
    /** capture window 上报 getUserMedia / getDisplayMedia 失败 */
    reportCaptureFailed(args: CaptureFailedArgs): void
  }
  // settings:T18 起补
}
