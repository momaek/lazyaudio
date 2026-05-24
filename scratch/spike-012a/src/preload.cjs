// preload: renderer ↔ main 桥;暴露最小 API
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('spike', {
  // renderer 拿到 IPC port 用于推 PCM (零拷贝 transferable)
  startRecord: (durationSec) => ipcRenderer.invoke('spike:start', durationSec),
  pushChunk: (src, pcmBuffer, frames) =>
    ipcRenderer.send('spike:chunk', { src, pcmBuffer, frames }),
  recordDone: () => ipcRenderer.send('spike:record-done'),
  log: (msg) => ipcRenderer.send('spike:log', msg),
})
