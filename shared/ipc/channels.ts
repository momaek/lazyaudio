// 通道名常量 — 纯字符串,**无运行时依赖**(不引 zod 等),preload 可以在 sandbox: true 下安全 import。
// schema(运行时校验)在 各自的 {domain}.ts 里,只在 main / utility / test / renderer 业务层引。

export const SYSTEM = {
  ping: 'system:ping',
} as const

export const RECORD = {
  getPrepDefaults: 'record:get-prep-defaults',
  start: 'record:start',
  pause: 'record:pause',
  resume: 'record:resume',
  stop: 'record:stop',
  tick: 'record:tick',
  stateChanged: 'record:state-changed',
  // T11 新增:prep 浮窗的取消按钮 / Esc 通过 IPC 通知 main 隐藏;
  // blur 自动 hide 仍在 main 端独立工作。ipc-contract.md §2.1 同步加。
  hidePrep: 'record:hide-prep',
} as const

export const LIBRARY = {
  list: 'library:list',
} as const

export const SETTINGS = {
  get: 'settings:get',
  set: 'settings:set',
  changed: 'settings:changed',
} as const

// T12 — audio capture control 信令(main → capture-window renderer)
// PCM 数据流走独立 MessagePort,不在这里;详见 audio-capture.md §4 + ipc-contract.md §2.3
export const AUDIO = {
  // main → capture renderer:启 capture(getUserMedia + getDisplayMedia,开始推 PCM)
  startCapture: 'audio:start-capture',
  // main → capture renderer:停 capture(tracks.stop + ctx.close + 发 track-close)
  stopCapture: 'audio:stop-capture',
  // capture renderer → main:采集启动失败(权限拒绝 / getDisplayMedia 失败等)
  captureFailed: 'audio:capture-failed',
  // main → capture renderer(webContents.postMessage):MessagePort 握手,
  // payload 是 transferable [MessagePortMain],renderer 在 preload 里接住
  port: 'audio-port',
} as const
