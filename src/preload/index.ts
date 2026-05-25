// preload:跑在 contextIsolation=true / sandbox=true 的隔离上下文,
// 用 contextBridge 把 white-list API 注入 renderer 的 window.lazyaudio。
// renderer 不能拿到 ipcRenderer / electron / process(coding-conventions §5 / §13)。
//
// 关键约束(踩坑记):
// - **sandbox: true 下 Electron 不支持 ESM preload**,electron.vite.config.ts 强制 preload 输出 CJS(.js)
// - **preload 不能 import 第三方运行时**(zod 等),否则 sandbox 静默拒绝加载。
//   所以 channel 名从 @shared/ipc/channels 拿(纯字符串),不引含 zod 的 @shared/ipc/system
import { contextBridge, ipcRenderer } from 'electron'
import { AUDIO } from '@shared/ipc/channels'
import { makeApi } from './bridge/make-api'

contextBridge.exposeInMainWorld('lazyaudio', makeApi())

// T12 — MessagePort 透传:main 通过 webContents.postMessage('audio-port', null, [port2])
// 把 MessagePort 推给 capture renderer。preload 收到后用 window.postMessage 转发到
// renderer main world(MessagePort 不能走 contextBridge,但 window.postMessage 原生支持
// transferable)。
//
// renderer main world 监听 `window.addEventListener('message', e)`,
// `e.data === 'audio-port' && e.ports[0]` 就是这个 port。
ipcRenderer.on(AUDIO.port, (event) => {
  // event.ports 是 MessagePort[]
  // preload 用的是 tsconfig.node.json(lib: ES2022 无 DOM),window 类型缺;
  // runtime 在 renderer 上下文 window.postMessage 一定存在(标准 Web API)。
  const win = globalThis as unknown as {
    postMessage: (data: unknown, targetOrigin: string, transfer?: unknown[]) => void
  }
  win.postMessage('audio-port', '*', event.ports)
})
