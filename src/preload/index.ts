// preload:跑在 contextIsolation=true / sandbox=true 的隔离上下文,
// 用 contextBridge 把 white-list API 注入 renderer 的 window.lazyaudio。
// renderer 不能拿到 ipcRenderer / electron / process(coding-conventions §5 / §13)。
import { contextBridge } from 'electron'
import { makeApi } from './bridge/make-api'

contextBridge.exposeInMainWorld('lazyaudio', makeApi())
