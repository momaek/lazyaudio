const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('spike', {
  buildReference: () => ipcRenderer.invoke('build-reference'),
  playReference: () => ipcRenderer.invoke('play-reference'),
  saveCapture: (payload, transferables) =>
    ipcRenderer.invoke('save-capture', payload, transferables),
  allDone: () => ipcRenderer.send('all-done'),
})
