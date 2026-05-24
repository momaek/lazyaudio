// spike-012a Electron main:
// 1. setDisplayMediaRequestHandler -> audio-only SCKit loopback (spike-005 决策)
// 2. createWindow + load index.html
// 3. fork Pass A utility (sherpa-onnx-node + silero-vad + sense-voice)
// 4. 收 renderer 'spike:chunk' PCM -> WAV append (mic/system 各一路) + mix -> utility
// 5. monitor 每 5s 采 process.memoryUsage + app.getAppMetrics -> monitor.jsonl
// 6. 收 utility 'pass-a:segment' -> segments.jsonl
//
// 用法:DURATION_SECONDS=300 electron .  (smoke)
//      DURATION_SECONDS=3600 electron . (1h bench)

const {
  app,
  BrowserWindow,
  ipcMain,
  session,
  utilityProcess,
  systemPreferences,
} = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { spawn } = require('node:child_process')

// 强制 Chromium 走 ScreenCaptureKit (macOS 14.4+ 新 picker;spike-005 验证过)
app.commandLine.appendSwitch(
  'enable-features',
  'ScreenCaptureKitMac,ScreenCaptureKitPickerScreen,ScreenCaptureKitStreamPickerSonoma',
)

const DURATION_SECONDS = Number(process.env.DURATION_SECONDS || 300) // 默认 5min smoke
const SAMPLE_RATE = 16000
const MONITOR_INTERVAL_MS = 5000

const RESULTS_ROOT = path.join(__dirname, '..', 'results')
fs.mkdirSync(RESULTS_ROOT, { recursive: true })

const runStamp = new Date().toISOString().replace(/[:.]/g, '-')
const runTag = DURATION_SECONDS >= 3600 ? '1h' : `${DURATION_SECONDS}s`
const RUN_DIR = path.join(RESULTS_ROOT, `${runTag}-${runStamp}`)
fs.mkdirSync(RUN_DIR, { recursive: true })

console.log(`[main] DURATION_SECONDS=${DURATION_SECONDS}`)
console.log(`[main] RUN_DIR=${RUN_DIR}`)

// ---- 状态 ----
let win = null
let passAProc = null
let monitorTimer = null
let monitorStream = null
let segmentsStream = null
let logStream = null
let micWavWriter = null
let sysWavWriter = null
let startedAt = 0
let micFramesTotal = 0
let sysFramesTotal = 0
let segmentsCount = 0
let chunksFromMic = 0
let chunksFromSys = 0
// 用 ring buffer 撮合 mic+sys 同步 (按到达顺序简单 sum,等量推 utility)
const micQueue = [] // { pcm: Float32Array, frames }
const sysQueue = []

// ---- 流式 WAV writer (16k mono Float32 -> Int16) ----
function openWavWriter(filePath) {
  const fd = fs.openSync(filePath, 'w')
  // 占位 header,关闭时回填
  const headerBuf = Buffer.alloc(44)
  fs.writeSync(fd, headerBuf, 0, 44, 0)
  let bytesWritten = 0
  return {
    append(float32) {
      const buf = Buffer.alloc(float32.length * 2)
      for (let i = 0; i < float32.length; i++) {
        let s = Math.max(-1, Math.min(1, float32[i]))
        s = s < 0 ? s * 0x8000 : s * 0x7fff
        buf.writeInt16LE(s | 0, i * 2)
      }
      fs.writeSync(fd, buf, 0, buf.length, 44 + bytesWritten)
      bytesWritten += buf.length
    },
    close() {
      // 回填 header
      const hdr = Buffer.alloc(44)
      hdr.write('RIFF', 0)
      hdr.writeUInt32LE(36 + bytesWritten, 4)
      hdr.write('WAVE', 8)
      hdr.write('fmt ', 12)
      hdr.writeUInt32LE(16, 16)
      hdr.writeUInt16LE(1, 20) // PCM
      hdr.writeUInt16LE(1, 22) // mono
      hdr.writeUInt32LE(SAMPLE_RATE, 24)
      hdr.writeUInt32LE(SAMPLE_RATE * 2, 28)
      hdr.writeUInt16LE(2, 32)
      hdr.writeUInt16LE(16, 34)
      hdr.write('data', 36)
      hdr.writeUInt32LE(bytesWritten, 40)
      fs.writeSync(fd, hdr, 0, 44, 0)
      fs.closeSync(fd)
    },
    bytes: () => bytesWritten,
  }
}

// ---- monitor:每 5s 采样资源,写 monitor.jsonl ----
function startMonitor() {
  const monitorPath = path.join(RUN_DIR, 'monitor.jsonl')
  monitorStream = fs.createWriteStream(monitorPath, { flags: 'a' })
  console.log(`[main] monitor -> ${monitorPath}`)

  // 基准 CPU 时间(getProcessCpuUsage 给的是累积 µs,需要差分)
  const cpuBase = new Map() // pid -> { user, system, t }

  monitorTimer = setInterval(async () => {
    const tNow = Date.now()
    const elapsedSec = (tNow - startedAt) / 1000
    const metrics = app.getAppMetrics()
    const rows = []
    for (const m of metrics) {
      const cpu = m.cpu || { percentCPUUsage: 0 }
      const memInfoMB = m.memory ? (m.memory.workingSetSize || 0) / 1024 : 0
      rows.push({
        pid: m.pid,
        type: m.type, // 'Browser' / 'Tab' / 'Utility' / 'GPU' / 'Renderer'
        name: m.name || '',
        cpuPct: cpu.percentCPUUsage || 0,
        rssMB: memInfoMB,
      })
      cpuBase.set(m.pid, { t: tNow })
    }
    const totalRssMB = rows.reduce((a, b) => a + b.rssMB, 0)
    const mainProcRss = process.memoryUsage().rss / 1024 / 1024
    monitorStream.write(
      JSON.stringify({
        tMs: tNow,
        elapsedSec,
        totalRssMB,
        mainProcRssMB: mainProcRss,
        chunksFromMic,
        chunksFromSys,
        micFramesTotal,
        sysFramesTotal,
        segmentsCount,
        processes: rows,
      }) + '\n',
    )
  }, MONITOR_INTERVAL_MS)
}

function stopMonitor() {
  if (monitorTimer) {
    clearInterval(monitorTimer)
    monitorTimer = null
  }
  if (monitorStream) {
    monitorStream.end()
    monitorStream = null
  }
}

// ---- Pass A utility ----
function startPassA() {
  const workerPath = path.join(__dirname, 'pass-a-worker.cjs')
  const modelsDir = path.join(__dirname, '..', 'models')
  passAProc = utilityProcess.fork(workerPath, [], {
    serviceName: 'spike-012a-pass-a',
    stdio: 'pipe',
    env: {
      ...process.env,
      MODELS_DIR: modelsDir,
      SAMPLE_RATE: String(SAMPLE_RATE),
    },
  })
  passAProc.stdout?.on('data', (d) => process.stdout.write(`[pass-a stdout] ${d}`))
  passAProc.stderr?.on('data', (d) => process.stderr.write(`[pass-a stderr] ${d}`))
  passAProc.on('exit', (code) => {
    console.log(`[main] pass-a utility exited code=${code}`)
  })
  passAProc.on('message', (msg) => {
    if (msg && msg.type === 'pass-a:ready') {
      console.log('[main] pass-a utility ready')
    } else if (msg && msg.type === 'pass-a:segment') {
      segmentsCount++
      if (segmentsStream) segmentsStream.write(JSON.stringify(msg) + '\n')
      if (segmentsCount <= 3 || segmentsCount % 20 === 0) {
        console.log(
          `[main] segment #${segmentsCount} startMs=${msg.startMs} text="${msg.text?.slice(0, 40)}" asrMs=${msg.asrLatencyMs} vad→asrMs=${msg.vadToAsrLatencyMs}`,
        )
      }
    } else if (msg && msg.type === 'pass-a:error') {
      console.error('[main] pass-a error:', msg.error)
    }
  })
}

function stopPassA() {
  if (passAProc) {
    passAProc.postMessage({ type: 'shutdown' })
    setTimeout(() => {
      try {
        passAProc?.kill()
      } catch {}
    }, 1500)
    passAProc = null
  }
}

// ---- 混音 + 推 utility (按到达顺序 pair-wise sum,clamp) ----
function tryDrainMixedToUtility() {
  while (micQueue.length > 0 && sysQueue.length > 0) {
    const m = micQueue.shift()
    const s = sysQueue.shift()
    const n = Math.min(m.frames, s.frames)
    const mixed = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      let v = m.pcm[i] + s.pcm[i]
      if (v > 1) v = 1
      else if (v < -1) v = -1
      mixed[i] = v
    }
    if (passAProc) {
      // utilityProcess.postMessage 自带结构化克隆;float32 array 会被拷贝
      passAProc.postMessage({ type: 'audio', pcm: mixed, frames: n })
    }
  }
  // 防止队列单边堆积 (一路 stall 会爆内存) - 限制 200 块
  if (micQueue.length > 200) micQueue.splice(0, micQueue.length - 200)
  if (sysQueue.length > 200) sysQueue.splice(0, sysQueue.length - 200)
}

// ---- session + display media handler ----
function setupDisplayMedia() {
  session.defaultSession.setDisplayMediaRequestHandler((req, callback) => {
    console.log(
      `[main] setDisplayMediaRequestHandler videoRequested=${req.videoRequested} audioRequested=${req.audioRequested}`,
    )
    callback({ audio: 'loopback' })
  })
}

function createWindow() {
  win = new BrowserWindow({
    width: 760,
    height: 560,
    title: 'spike-012a 1h 压测',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: false,
    },
  })
  win.loadFile(path.join(__dirname, 'index.html'))
  win.webContents.on('console-message', (_e, level, msg) => {
    if (level >= 2) console.log(`[renderer ${level}] ${msg}`)
  })
}

// ---- IPC handlers ----
// ---- 自动测试声源 (排除"用户没放声音"嫌疑) ----
// 启动后每 5s spawn 一次 `say`,系统输出会有可识别的人声。
// system loopback 必定能拾到;mic 路如果没合盖也能拾到(声音从扬声器传到 mic)。
let saySpeaker = null
function startTestSpeech() {
  const phrases = [
    'Spike zero twelve a test recording. Now playing a sentence for VAD endpoint detection.',
    'The quick brown fox jumps over the lazy dog. This is a test of the audio capture pipeline.',
    '你好世界。这是一段中文测试。用于验证麦克风和系统音频回环采集是否正常。',
    'One two three four five. Testing testing testing. Pass A engine should detect this segment.',
  ]
  let idx = 0
  const playOne = () => {
    if (!startedAt) return // 没在录音
    const text = phrases[idx % phrases.length]
    idx++
    saySpeaker = spawn('say', [text], { stdio: 'ignore' })
    saySpeaker.on('exit', () => {
      saySpeaker = null
      setTimeout(playOne, 1500) // 间隔 1.5s 再播下一句
    })
    saySpeaker.on('error', (e) => console.error('[main] say error:', e))
  }
  playOne()
}

ipcMain.handle('spike:start', () => {
  startedAt = Date.now()
  const segPath = path.join(RUN_DIR, 'segments.jsonl')
  segmentsStream = fs.createWriteStream(segPath, { flags: 'a' })
  const logPath = path.join(RUN_DIR, 'renderer.log')
  logStream = fs.createWriteStream(logPath, { flags: 'a' })
  micWavWriter = openWavWriter(path.join(RUN_DIR, 'mic.wav'))
  sysWavWriter = openWavWriter(path.join(RUN_DIR, 'system.wav'))

  const meta = {
    spike: 'spike-012a',
    durationSeconds: DURATION_SECONDS,
    sampleRate: SAMPLE_RATE,
    monitorIntervalMs: MONITOR_INTERVAL_MS,
    runStamp,
    startedAtMs: startedAt,
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    node: process.versions.node,
  }
  fs.writeFileSync(path.join(RUN_DIR, 'meta.json'), JSON.stringify(meta, null, 2))

  startPassA()
  startMonitor()
  // smoke 模式下自动播测试声源,排除用户没放音乐嫌疑;1h bench 时关掉(怕扰民)
  if (DURATION_SECONDS <= 600) {
    console.log('[main] DURATION ≤ 600s -> 自动 spawn `say` 播测试句,30s 后 say 还在循环')
    startTestSpeech()
  }
  console.log(`[main] recording start, will run ${DURATION_SECONDS}s`)
  return { durationSeconds: DURATION_SECONDS, runDir: RUN_DIR }
})

ipcMain.on('spike:chunk', (_e, payload) => {
  // payload: { src:'mic'|'sys', pcmBuffer:ArrayBuffer, frames }
  const { src, pcmBuffer, frames } = payload
  const pcm = new Float32Array(pcmBuffer)
  if (src === 'mic') {
    chunksFromMic++
    micFramesTotal += frames
    micWavWriter?.append(pcm)
    micQueue.push({ pcm, frames })
  } else {
    chunksFromSys++
    sysFramesTotal += frames
    sysWavWriter?.append(pcm)
    sysQueue.push({ pcm, frames })
  }
  tryDrainMixedToUtility()
})

ipcMain.on('spike:record-done', () => {
  console.log(
    `[main] record done; mic chunks=${chunksFromMic} frames=${micFramesTotal}; sys chunks=${chunksFromSys} frames=${sysFramesTotal}; segments=${segmentsCount}`,
  )
  micWavWriter?.close()
  sysWavWriter?.close()
  micWavWriter = null
  sysWavWriter = null
  stopMonitor()
  // 给 utility 1.5s flush 尾段
  setTimeout(() => {
    stopPassA()
    if (segmentsStream) segmentsStream.end()
    if (logStream) logStream.end()
    console.log(`[main] all done; results in ${RUN_DIR}`)
    setTimeout(() => app.quit(), 800)
  }, 1500)
})

ipcMain.on('spike:log', (_e, msg) => {
  if (logStream) logStream.write(`${new Date().toISOString()} ${msg}\n`)
})

// ---- mac TCC 权限状态诊断 (复用 spike-005 模式) ----
function logMacPermissions() {
  if (process.platform !== 'darwin') return
  const screen = systemPreferences.getMediaAccessStatus('screen')
  const mic = systemPreferences.getMediaAccessStatus('microphone')
  console.log(`[main] macOS TCC: screen=${screen}, microphone=${mic}`)
  console.log(
    '[main] audio-only SCKit 走 "System Audio Recording Only" 分组,不是 "Screen Recording"。',
  )
  console.log('[main] 如果 microphone != "granted" -> mic stream 会 silent。')
  console.log(
    '[main] 如果 screen != "granted" 但 macOS 14.4+ audio-only 不强求 screen 权限,值可能仍是 "not-determined"。',
  )
}

// ---- lifecycle ----
app.whenReady().then(() => {
  logMacPermissions()
  setupDisplayMedia()
  createWindow()
})

app.on('window-all-closed', () => {
  stopMonitor()
  stopPassA()
  app.quit()
})
