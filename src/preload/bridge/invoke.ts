// 包装 ipcRenderer.invoke,统一错误归一化。
// 这里**不**做 zod 双向校验(main 已在边界跑过 parse);renderer 拿回的是 Promise<T>。
import { ipcRenderer } from 'electron'

export async function invoke<T>(channel: string, args?: unknown): Promise<T> {
  return ipcRenderer.invoke(channel, args) as Promise<T>
}
