// preload 通过 contextBridge 暴露给 renderer 的 API 接口。
// renderer 在 src/renderer/global.d.ts 把 window.lazyaudio: LazyAudioApi 注册成全局类型。

import type { PingResult } from '../ipc/system'
import type { PrepDefaults, StartArgs, StartResult, HidePrepResult } from '../ipc/record'

export interface LazyAudioApi {
  system: {
    ping(): Promise<PingResult>
  }
  record: {
    /** prep 浮窗 mount 时拉默认 sessionType + sources */
    getPrepDefaults(): Promise<PrepDefaults>
    /** 用户在 prep 浮窗点"开始录音"/Enter 时调;T11 仅 stub,T13 接真实落盘 */
    start(args: StartArgs): Promise<StartResult>
    /** 取消按钮 / Esc 通知 main 隐藏 prep 浮窗 */
    hidePrep(): Promise<HidePrepResult>
  }
  // settings:T18 起补
}
