// spike-010 主进程:测"快捷键回调 → 浮窗可见"时延 + 收集 renderer 上报的 PCM 时延
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const N_SHOW = 15
const N_PCM = 10

const showSamples = []
const pcmSamples = []
let win

function createPrepWindow() {
  win = new BrowserWindow({
    width: 520,
    height: 360,
    show: false,
    title: 'spike-010 bench',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  })
  win.loadFile(path.join(__dirname, 'index.html'))
}

async function hideAndWait() {
  if (!win.isVisible()) return
  return new Promise((resolve) => {
    const t = setTimeout(resolve, 800)
    win.once('hide', () => {
      clearTimeout(t)
      resolve()
    })
    win.hide()
  })
}

async function benchOneShow() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('show event timeout 1.5s')), 1500)
    win.once('show', () => {
      clearTimeout(timer)
      const t1 = process.hrtime.bigint()
      resolve(Number(t1 - t0) / 1e6)
    })
    const t0 = process.hrtime.bigint()
    win.show()
  })
}

async function runShowBench() {
  console.log('[show] enter runShowBench, isVisible=' + win.isVisible())
  await hideAndWait()
  console.log('[show] confirmed hidden, isVisible=' + win.isVisible())
  await new Promise((r) => setTimeout(r, 300))

  try {
    const warmMs = await benchOneShow()
    console.log(`[show] warmup: ${warmMs.toFixed(2)}ms (丢弃)`)
  } catch (e) {
    console.log('[show] warmup FAILED: ' + e.message)
    return showSamples
  }
  await hideAndWait()
  await new Promise((r) => setTimeout(r, 250))

  for (let i = 0; i < N_SHOW; i++) {
    try {
      const ms = await benchOneShow()
      showSamples.push(ms)
      console.log(`[show] round ${i + 1}/${N_SHOW}: ${ms.toFixed(2)}ms`)
    } catch (e) {
      console.log(`[show] round ${i + 1} FAILED: ${e.message}`)
      break
    }
    await hideAndWait()
    await new Promise((r) => setTimeout(r, 250))
  }
  win.show()
  return showSamples
}

function stats(arr) {
  if (arr.length === 0) return { n: 0 }
  const sorted = [...arr].sort((a, b) => a - b)
  const n = sorted.length
  const pick = (q) => sorted[Math.min(n - 1, Math.floor(n * q))]
  return {
    n,
    min: +sorted[0].toFixed(2),
    p50: +pick(0.5).toFixed(2),
    p95: +pick(0.95).toFixed(2),
    max: +sorted[n - 1].toFixed(2),
    mean: +(sorted.reduce((a, b) => a + b, 0) / n).toFixed(2),
  }
}

ipcMain.handle('run-show-bench', () => runShowBench())
ipcMain.on('pcm-sample', (_e, ms) => {
  pcmSamples.push(ms)
  console.log(`[pcm]  round ${pcmSamples.length}/${N_PCM}: ${ms.toFixed(2)}ms`)
})

ipcMain.on('all-done', () => {
  const result = {
    timestamp: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    node: process.versions.node,
    show: { stats: stats(showSamples), samples: showSamples.map((n) => +n.toFixed(2)) },
    pcm: { stats: stats(pcmSamples), samples: pcmSamples.map((n) => +n.toFixed(2)) },
  }
  const resultsDir = path.join(__dirname, '..', 'results')
  fs.mkdirSync(resultsDir, { recursive: true })
  const outPath = path.join(resultsDir, `bench-${Date.now()}.json`)
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2))

  console.log('\n=== spike-010 results ===')
  console.log('A. 快捷键回调 → 浮窗 show event (main process clock):')
  console.table(result.show.stats)
  console.log('B. record:start IPC → AudioWorklet 第一帧 PCM (renderer process clock):')
  console.table(result.pcm.stats)
  console.log(
    `\nA + B p50 = ${(result.show.stats.p50 + result.pcm.stats.p50).toFixed(2)}ms (PRD §7.1 预算 500ms)`,
  )
  console.log(`A + B p95 = ${(result.show.stats.p95 + result.pcm.stats.p95).toFixed(2)}ms`)
  console.log(`\nwrote: ${outPath}`)

  setTimeout(() => app.quit(), 300)
})

app.whenReady().then(() => {
  createPrepWindow()
  win.webContents.on('console-message', (_e, level, msg) => {
    console.log(`[renderer ${level}] ${msg}`)
  })
  // 浮窗常驻 hidden 模拟 production: ready-to-show 后不 auto show,
  // 让 bench 第一次 .show() 是真正的 hidden→visible 转换
  win.once('ready-to-show', () => {
    console.log('[main] prep window ready (hidden), trigger bench in 500ms')
    setTimeout(() => win.webContents.send('start-bench'), 500)
  })
})

app.on('window-all-closed', () => app.quit())
