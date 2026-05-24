// spike-005 主进程：
// 1. 配置 setDisplayMediaRequestHandler（让 renderer 拿 system loopback audio）
// 2. 生成 reference.wav（含 N 个 click 脉冲）
// 3. renderer 启 mic + system capture → 主进程 spawn afplay 播 reference
// 4. 收 renderer 上来的 PCM chunks → 写两路 wav + meta.json
// 5. 跑 analyze.mjs 出报告

const {
  app,
  BrowserWindow,
  ipcMain,
  session,
  desktopCapturer,
  systemPreferences,
} = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { spawn } = require('node:child_process')

// 强制 Chromium 走 ScreenCaptureKit（macOS 14.4+ 的新 picker），
// 解决 macOS 15 Sequoia 上老 CGWindowList API 被 TCC 静默拒绝的问题。
// 必须在 app.whenReady() 之前调用。
app.commandLine.appendSwitch(
  'enable-features',
  'ScreenCaptureKitMac,ScreenCaptureKitPickerScreen,ScreenCaptureKitStreamPickerSonoma',
)

const SAMPLE_RATE = 48000
const RECORD_SECONDS = 12 // 含前后 padding
const CLICK_COUNT = 6
const CLICK_INTERVAL_S = 1.5
const CLICK_FIRST_AT_S = 2 // 播放开始后第一个 click 的时刻
const CLICK_DUR_S = 0.005
const CLICK_FREQ_HZ = 1000

const RESULTS_DIR = path.join(__dirname, '..', 'results')

let win
let runMeta = null

function ensureResultsDir() {
  fs.mkdirSync(RESULTS_DIR, { recursive: true })
}

// ---- WAV writer (mono, 16-bit PCM) ----
function writeWavMono16(filePath, float32) {
  const sampleCount = float32.length
  const byteCount = sampleCount * 2
  const buf = Buffer.alloc(44 + byteCount)
  // RIFF header
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + byteCount, 4)
  buf.write('WAVE', 8)
  // fmt chunk
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16) // PCM chunk size
  buf.writeUInt16LE(1, 20) // PCM format
  buf.writeUInt16LE(1, 22) // channels
  buf.writeUInt32LE(SAMPLE_RATE, 24)
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28) // byte rate
  buf.writeUInt16LE(2, 32) // block align
  buf.writeUInt16LE(16, 34) // bits/sample
  // data chunk
  buf.write('data', 36)
  buf.writeUInt32LE(byteCount, 40)
  for (let i = 0; i < sampleCount; i++) {
    let s = Math.max(-1, Math.min(1, float32[i]))
    s = s < 0 ? s * 0x8000 : s * 0x7fff
    buf.writeInt16LE(s | 0, 44 + i * 2)
  }
  fs.writeFileSync(filePath, buf)
}

// ---- Reference click 生成（5ms 1kHz tone w/ raised-cosine envelope）----
function buildReferenceFloat32() {
  const total = Math.ceil(SAMPLE_RATE * RECORD_SECONDS)
  const out = new Float32Array(total)
  const clickSamples = Math.floor(CLICK_DUR_S * SAMPLE_RATE)
  const expectedTimes = []
  for (let k = 0; k < CLICK_COUNT; k++) {
    const tSec = CLICK_FIRST_AT_S + k * CLICK_INTERVAL_S
    expectedTimes.push(tSec)
    const start = Math.floor(tSec * SAMPLE_RATE)
    for (let i = 0; i < clickSamples && start + i < total; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (clickSamples - 1)) // Hann window
      out[start + i] = 0.8 * w * Math.sin((2 * Math.PI * CLICK_FREQ_HZ * i) / SAMPLE_RATE)
    }
  }
  return { pcm: out, expectedTimes }
}

function logMacPermissions() {
  if (process.platform !== 'darwin') return
  const screen = systemPreferences.getMediaAccessStatus('screen')
  const mic = systemPreferences.getMediaAccessStatus('microphone')
  console.log(`[main] macOS perm: screen=${screen}, microphone=${mic}`)
  console.log('[main] 本 spike 走 audio-only ScreenCaptureKit 路径，对应 macOS 14.4+ 的')
  console.log('[main] "System Audio Recording Only" 权限分组，理论上不需要 Screen Recording。')
  console.log('[main] 第一次跑 macOS 应该弹"允许录制系统音频"对话框；如果状态卡在 denied/没弹框，')
  console.log('[main] 试：tccutil reset SystemAudioRecordingOnly com.github.Electron + 重启')
}

function setupDisplayMedia() {
  // setDisplayMediaRequestHandler 是 renderer 调 getDisplayMedia 的必经；
  // 只回 audio: 'loopback' 不带 video → 走 macOS 14.4+ audio-only SCKit 路径。
  session.defaultSession.setDisplayMediaRequestHandler((req, callback) => {
    console.log(
      `[main] setDisplayMediaRequestHandler called; videoRequested=${req.videoRequested}, audioRequested=${req.audioRequested}`,
    )
    callback({ audio: 'loopback' })
  })
}

function createWindow() {
  win = new BrowserWindow({
    width: 720,
    height: 520,
    title: 'spike-005 mic/system drift',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false, // renderer 用 ArrayBuffer transfer，sandbox 关掉省事
    },
  })
  win.loadFile(path.join(__dirname, 'index.html'))
  win.webContents.on('console-message', (_e, level, msg) => {
    console.log(`[renderer ${level}] ${msg}`)
  })
}

ipcMain.handle('build-reference', () => {
  ensureResultsDir()
  const { pcm, expectedTimes } = buildReferenceFloat32()
  const refPath = path.join(RESULTS_DIR, 'reference.wav')
  writeWavMono16(refPath, pcm)
  runMeta = {
    timestamp: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    sampleRate: SAMPLE_RATE,
    recordSeconds: RECORD_SECONDS,
    click: {
      count: CLICK_COUNT,
      intervalSec: CLICK_INTERVAL_S,
      firstAtSec: CLICK_FIRST_AT_S,
      durSec: CLICK_DUR_S,
      freqHz: CLICK_FREQ_HZ,
    },
    referencePath: refPath,
    expectedClickTimes: expectedTimes,
  }
  console.log('[main] reference.wav written:', refPath)
  return runMeta
})

ipcMain.handle('play-reference', async () => {
  if (!runMeta) throw new Error('reference not built yet')
  console.log('[main] spawn afplay …')
  const t0 = process.hrtime.bigint()
  return new Promise((resolve) => {
    const child = spawn('afplay', [runMeta.referencePath], { stdio: 'ignore' })
    child.on('close', (code) => {
      const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6
      console.log(`[main] afplay closed code=${code} elapsed=${elapsedMs.toFixed(0)}ms`)
      resolve({ exitCode: code, elapsedMs })
    })
    child.on('error', (e) => {
      console.error('[main] afplay error:', e)
      resolve({ exitCode: -1, error: String(e) })
    })
  })
})

ipcMain.handle('save-capture', (_e, payload) => {
  // payload: { runIndex, mic: ArrayBuffer(Float32), system: ArrayBuffer(Float32), micFrames, sysFrames }
  const { runIndex, mic, system, micFrames, sysFrames } = payload
  const micF32 = new Float32Array(mic)
  const sysF32 = new Float32Array(system)
  const stamp = Date.now()
  const tag = `run${runIndex}-${stamp}`
  const micPath = path.join(RESULTS_DIR, `mic-${tag}.wav`)
  const sysPath = path.join(RESULTS_DIR, `system-${tag}.wav`)
  writeWavMono16(micPath, micF32)
  writeWavMono16(sysPath, sysF32)
  const meta = {
    ...runMeta,
    runIndex,
    micPath,
    sysPath,
    micFrames,
    sysFrames,
    micDurationSec: micF32.length / SAMPLE_RATE,
    sysDurationSec: sysF32.length / SAMPLE_RATE,
  }
  const metaPath = path.join(RESULTS_DIR, `meta-${tag}.json`)
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))
  console.log(`[main] saved run${runIndex}:`)
  console.log(`  ${micPath}`)
  console.log(`  ${sysPath}`)
  console.log(`  ${metaPath}`)
  return { micPath, sysPath, metaPath }
})

ipcMain.on('all-done', () => {
  console.log('[main] all runs done, quitting in 500ms …')
  setTimeout(() => app.quit(), 500)
})

app.whenReady().then(() => {
  logMacPermissions()
  setupDisplayMedia()
  createWindow()
})

app.on('window-all-closed', () => app.quit())
