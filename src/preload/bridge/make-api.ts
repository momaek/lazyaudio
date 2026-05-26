// 构造暴露给 renderer 的 white-list API 对象。
// renderer 只能调这里 export 的方法,不能直接拿到 ipcRenderer / electron / process。
//
// 关键约束:preload 在 sandbox: true 下不能 import 第三方运行时(zod 等),
// 否则 contextBridge 注入静默失败 → window.lazyaudio undefined。
// CHANNEL 名从 @shared/ipc/channels(纯字符串常量,无 zod)拿;schema 留给 main / renderer 业务层。
import { ipcRenderer } from 'electron'
import { SYSTEM, RECORD, AUDIO, LIBRARY } from '@shared/ipc/channels'
import type { LazyAudioApi } from '@shared/types/api'
import type { PingResult } from '@shared/ipc/system'
import type { PrepDefaults, StartArgs, StartResult, HidePrepResult } from '@shared/ipc/record'
import type { ListResult } from '@shared/ipc/library'
import type { StartCaptureArgs, StopCaptureArgs } from '@shared/audio/messages'
import { invoke } from './invoke'

export function makeApi(): LazyAudioApi {
  return {
    system: {
      ping: () => invoke<PingResult>(SYSTEM.ping),
    },
    record: {
      getPrepDefaults: () => invoke<PrepDefaults>(RECORD.getPrepDefaults),
      start: (args: StartArgs) => invoke<StartResult>(RECORD.start, args),
      stop: () => invoke<{ ok: boolean }>(RECORD.stop, {}),
      hidePrep: () => invoke<HidePrepResult>(RECORD.hidePrep),
    },
    library: {
      list: () => invoke<ListResult>(LIBRARY.list, {}),
    },
    audio: {
      // capture window 订阅 main 发的启 capture 信令
      onStartCapture: (cb) => {
        const handler = (_e: unknown, args: StartCaptureArgs): void => cb(args)
        ipcRenderer.on(AUDIO.startCapture, handler)
        return () => ipcRenderer.off(AUDIO.startCapture, handler)
      },
      onStopCapture: (cb) => {
        const handler = (_e: unknown, args: StopCaptureArgs): void => cb(args)
        ipcRenderer.on(AUDIO.stopCapture, handler)
        return () => ipcRenderer.off(AUDIO.stopCapture, handler)
      },
      reportCaptureFailed: (args) => ipcRenderer.send(AUDIO.captureFailed, args),
    },
  }
}
