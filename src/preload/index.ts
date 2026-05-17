// preload:跑在 contextIsolation=true / sandbox=true 的隔离上下文,
// 用 contextBridge 把 white-list API 注入 renderer 的 window.lazyaudio。
// renderer 不能拿到 ipcRenderer / electron / process(coding-conventions §5 / §13)。
//
// 关键约束(踩坑记):
// - **sandbox: true 下 Electron 不支持 ESM preload**,electron.vite.config.ts 强制 preload 输出 CJS(.js)
// - **preload 不能 import 第三方运行时**(zod 等),否则 sandbox 静默拒绝加载。
//   所以 channel 名从 @shared/ipc/channels 拿(纯字符串),不引含 zod 的 @shared/ipc/system
import { contextBridge } from 'electron'
import { makeApi } from './bridge/make-api'

contextBridge.exposeInMainWorld('lazyaudio', makeApi())
