// spike-005 analyze smoke：合成已知漂移的 mic/system 假数据 → 跑 analyze 检测逻辑 →
// 验证检测到的漂移与注入的漂移在 ±2ms 内吻合（5ms click 在 48kHz 下峰值检测的固有误差 < 1 sample = 0.02ms，
// 阈值 2ms 留给搜索窗口与包络滤波的副作用）。
//
// 用法：node src/smoke-analyze.mjs
// 通过 → exit 0；失败 → exit 1（CI / 本地 sanity 都可用）

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SAMPLE_RATE = 48000

// 复制自 main.js（避免 import Electron 主进程模块的副作用）
function writeWavMono16(filePath, float32) {
  const sampleCount = float32.length
  const byteCount = sampleCount * 2
  const buf = Buffer.alloc(44 + byteCount)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + byteCount, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(SAMPLE_RATE, 24)
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(byteCount, 40)
  for (let i = 0; i < sampleCount; i++) {
    let s = Math.max(-1, Math.min(1, float32[i]))
    s = s < 0 ? s * 0x8000 : s * 0x7fff
    buf.writeInt16LE(s | 0, 44 + i * 2)
  }
  fs.writeFileSync(filePath, buf)
}

function buildClicksAt(timesSec, durationSec, gain = 0.8) {
  const total = Math.ceil(SAMPLE_RATE * durationSec)
  const out = new Float32Array(total)
  const clickSamples = Math.floor(0.005 * SAMPLE_RATE)
  for (const t of timesSec) {
    const start = Math.floor(t * SAMPLE_RATE)
    for (let i = 0; i < clickSamples && start + i < total; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (clickSamples - 1))
      out[start + i] = gain * w * Math.sin((2 * Math.PI * 1000 * i) / SAMPLE_RATE)
    }
  }
  return out
}

function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-005-smoke-'))
  console.log('smoke fixture dir:', tmpDir)

  // 注入的 ground truth：6 个 click，mic 路统一比 system 慢 17.2 ms（系统级常量漂移）
  const expectedClickTimes = [2, 3.5, 5, 6.5, 8, 9.5]
  const injectedDriftMs = 17.2
  const driftSec = injectedDriftMs / 1000

  const sysPcm = buildClicksAt(expectedClickTimes, 12)
  const micPcm = buildClicksAt(
    expectedClickTimes.map((t) => t + driftSec),
    12,
  )

  const tag = `smoke-${Date.now()}`
  const micPath = path.join(tmpDir, `mic-${tag}.wav`)
  const sysPath = path.join(tmpDir, `system-${tag}.wav`)
  writeWavMono16(micPath, micPcm)
  writeWavMono16(sysPath, sysPcm)

  const meta = {
    timestamp: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    sampleRate: SAMPLE_RATE,
    recordSeconds: 12,
    click: {
      count: expectedClickTimes.length,
      intervalSec: 1.5,
      firstAtSec: 2,
      durSec: 0.005,
      freqHz: 1000,
    },
    referencePath: null,
    expectedClickTimes,
    runIndex: 1,
    micPath,
    sysPath,
    micFrames: micPcm.length,
    sysFrames: sysPcm.length,
    micDurationSec: micPcm.length / SAMPLE_RATE,
    sysDurationSec: sysPcm.length / SAMPLE_RATE,
    _injectedDriftMs: injectedDriftMs,
  }
  fs.writeFileSync(path.join(tmpDir, `meta-${tag}.json`), JSON.stringify(meta, null, 2))

  // 跑 analyze
  const analyzePath = path.join(__dirname, 'analyze.mjs')
  const out = execSync(`node "${analyzePath}" "${tmpDir}"`, { encoding: 'utf8' })
  console.log(out)

  // 读 summary，校验
  const summaryPath = path.join(tmpDir, 'analysis-summary.json')
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'))
  const detectedMean = summary.overallDriftMs.mean
  const detectedP95Abs = summary.overallAbsDriftMs.p95
  const err = Math.abs(detectedMean - injectedDriftMs)

  console.log('===== SMOKE CHECK =====')
  console.log(`injected drift  : ${injectedDriftMs} ms (mic 慢 ${injectedDriftMs}ms)`)
  console.log(`detected mean   : ${detectedMean} ms`)
  console.log(`detected p95|·| : ${detectedP95Abs} ms`)
  console.log(`error           : ${err.toFixed(3)} ms`)

  // 清理临时目录（哪怕失败也清）
  fs.rmSync(tmpDir, { recursive: true, force: true })

  if (err > 2) {
    console.error(`FAIL: detected mean drift 偏离注入值 > 2ms (${err.toFixed(3)}ms)`)
    process.exit(1)
  }
  console.log('PASS: analyze.mjs 检测逻辑正确')
}

main()
