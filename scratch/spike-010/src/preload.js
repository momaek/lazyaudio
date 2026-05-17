const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('spike', {
  runShowBench: () => ipcRenderer.invoke('run-show-bench'),
  reportPcm: (ms) => ipcRenderer.send('pcm-sample', ms),
  allDone: () => ipcRenderer.send('all-done'),
  onStartBench: (cb) => ipcRenderer.on('start-bench', () => cb()),
})
