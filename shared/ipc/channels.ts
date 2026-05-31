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
  // renderer(主窗口)mount 时拉一次当前录音状态;之后靠 stateChanged 增量更新
  getState: 'record:get-state',
  // T11 新增:prep 浮窗的取消按钮 / Esc 通过 IPC 通知 main 隐藏;
  // blur 自动 hide 仍在 main 端独立工作。ipc-contract.md §2.1 同步加。
  hidePrep: 'record:hide-prep',
  // 主窗口空状态「开始录音」按钮:让 main 弹 prep 浮窗(等价 ⌘⇧R / tray 入口)
  showPrep: 'record:show-prep',
} as const

export const LIBRARY = {
  list: 'library:list',
} as const

// T16 — 录音音频的自定义流式协议(main 注册 protocol.handle,renderer 拿来喂 <audio>)。
// renderer 在 webSecurity: true 下不能直接 file:// 读录音目录;走这个 scheme 由 main
// 解析最佳轨道(mixed > mic > system)、做路径穿越防护后流式吐文件(支持 Range → 可拖动)。
// URL 形如 `lazyaudio-media://recording/<recordingId>`。
export const MEDIA = {
  scheme: 'lazyaudio-media',
  host: 'recording',
} as const

/** 给定 recordingId 拼出播放用的媒体 URL(renderer / main 共用,避免散落字符串拼接) */
export function mediaUrl(recordingId: string): string {
  return `${MEDIA.scheme}://${MEDIA.host}/${encodeURIComponent(recordingId)}`
}

export const SETTINGS = {
  get: 'settings:get',
  set: 'settings:set',
  changed: 'settings:changed',
} as const

// T51 — LLM 摘要:生成 / 取消 / 取结果 / 测连接 + 流式事件广播
export const SUMMARY = {
  generate: 'summary:generate',
  cancel: 'summary:cancel',
  get: 'summary:get',
  testConnection: 'summary:test-connection',
  // main → renderer:流式 delta / 完成 / 失败
  chunk: 'summary:chunk',
  done: 'summary:done',
  error: 'summary:error',
} as const

// T32/T33/T37/T39 — 转录:取 transcript / 重试 / 全文搜索 + 状态广播
export const TRANSCRIBE = {
  getTranscript: 'transcribe:get-transcript',
  retry: 'transcribe:retry',
  search: 'transcribe:search',
  // main → renderer:某录音转录状态变更(running/done/failed + 进度)
  statusChanged: 'transcribe:status-changed',
  // T34 main → renderer:Pass A 实时段(hypothesis / confirmed,同 id 原地替换)
  liveSegment: 'transcribe:live-segment',
  // T36 main → renderer:Pass B 完成,整体换 transcript.json
  offlineOverwrite: 'transcribe:offline-overwrite',
} as const

// T31 — 模型下载(Pass B SenseVoice int8):列表 / 下载 / 取消 / 删除 + 下载事件广播
export const MODEL = {
  list: 'model:list',
  download: 'model:download',
  cancel: 'model:cancel',
  delete: 'model:delete',
  // main → renderer:下载生命周期事件(start/progress/source-switched/done/error/cancelled)
  event: 'model:event',
} as const

// T20 — 权限引导(简版):麦克风权限检测 / 请求 / 跳系统设置
export const PERMISSION = {
  getMicStatus: 'permission:get-mic-status',
  requestMic: 'permission:request-mic',
  openMicSettings: 'permission:open-mic-settings',
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
