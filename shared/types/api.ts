// preload 通过 contextBridge 暴露给 renderer 的 API 接口。
// renderer 在 src/renderer/global.d.ts 把 window.lazyaudio: LazyAudioApi 注册成全局类型。

import type { PingResult } from '../ipc/system'
import type {
  PrepDefaults,
  StartArgs,
  StartResult,
  HidePrepResult,
  RecorderSnapshot,
} from '../ipc/record'
import type { ListResult } from '../ipc/library'
import type { Settings, SetArgs } from '../ipc/settings'
import type { MicStatusResult, RequestMicResult, OpenMicSettingsResult } from '../ipc/permission'
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
    /** 主窗口 mount 时拉一次当前录音状态快照 */
    getState(): Promise<RecorderSnapshot>
    /** 订阅录音状态变更广播(main 每次状态转换后发);返回取消订阅函数 */
    onStateChanged(cb: (snapshot: RecorderSnapshot) => void): () => void
  }
  library: {
    /** T15 录音库 v0.1:按日期分组返回 recordings 下的 meta 快照 */
    list(): Promise<ListResult>
  }
  settings: {
    /** 拉当前完整 settings(窗口 mount 时调) */
    get(): Promise<Settings>
    /** 部分更新 settings;main 合并落盘后返回新的完整 settings */
    set(patch: SetArgs): Promise<Settings>
    /** 订阅 settings 变更广播;返回取消订阅函数 */
    onChanged(cb: (settings: Settings) => void): () => void
  }
  permission: {
    /** T20 查麦克风权限状态 */
    getMicStatus(): Promise<MicStatusResult>
    /** 触发系统授权框(仅 not-determined 有效);返回最终状态 */
    requestMic(): Promise<RequestMicResult>
    /** 跳到系统设置麦克风隐私页 */
    openMicSettings(): Promise<OpenMicSettingsResult>
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
