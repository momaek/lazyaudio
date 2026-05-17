// 构造暴露给 renderer 的 white-list API 对象。
// renderer 只能调这里 export 的方法,不能直接拿到 ipcRenderer / electron / process。
//
// 关键约束:preload 在 sandbox: true 下不能 import 第三方运行时(zod 等),
// 否则 contextBridge 注入静默失败 → window.lazyaudio undefined。
// CHANNEL 名从 @shared/ipc/channels(纯字符串常量,无 zod)拿;schema 留给 main / renderer 业务层。
import { SYSTEM } from '@shared/ipc/channels'
import type { LazyAudioApi } from '@shared/types/api'
import type { PingResult } from '@shared/ipc/system'
import { invoke } from './invoke'

export function makeApi(): LazyAudioApi {
  return {
    system: {
      ping: () => invoke<PingResult>(SYSTEM.ping),
    },
  }
}
