// preload 通过 contextBridge 暴露给 renderer 的 API 接口。
// renderer 在 src/renderer/global.d.ts 把 window.lazyaudio: LazyAudioApi 注册成全局类型。

import type { PingResult } from '../ipc/system'

export interface LazyAudioApi {
  system: {
    ping(): Promise<PingResult>
  }
  // record / settings:T11 / T18 起补
  // 当前只暴露 system.ping,IPC 框架端到端 sanity 用
}
