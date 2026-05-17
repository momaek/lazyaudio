// 构造暴露给 renderer 的 white-list API 对象。
// renderer 只能调这里 export 的方法,不能直接拿到 ipcRenderer / electron / process。
import { CHANNEL as SYSTEM } from '@shared/ipc/system'
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
