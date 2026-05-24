// spike-005 离线分析：读 results/ 下所有 meta-*.json + 对应 mic/system wav，
// 找两路里 click 峰值的位置，算每对 click 的时间差，输出统计 + per-click 表 + 漂移随时间趋势。
//
// 用法：node src/analyze.mjs [resultsDir]

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RESULTS_DIR = process.argv[2] || path.join(__dirname, '..', 'results')

// ---- WAV reader: mono 16-bit PCM (我们 writer 写的格式) ----
function readWavMono16(filePath) {
  const buf = fs.readFileSync(filePath)
  if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error('not RIFF: ' + filePath)
  if (buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not WAVE: ' + filePath)
  const channels = buf.readUInt16LE(22)
  const sampleRate = buf.readUInt32LE(24)
  const bits = buf.readUInt16LE(34)
  if (channels !== 1 || bits !== 16) {
    throw new Error(`unexpected ch=${channels} bits=${bits} in ${filePath}`)
  }
  // 找 data chunk（跳过可能存在的额外 chunk）
  let off = 12
  let dataOff = -1
  let dataLen = 0
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    const sz = buf.readUInt32LE(off + 4)
    if (id === 'data') {
      dataOff = off + 8
      dataLen = sz
      break
    }
    off += 8 + sz
  }
  if (dataOff < 0) throw new Error('no data chunk: ' + filePath)
  const sampleCount = dataLen / 2
  const out = new Float32Array(sampleCount)
  for (let i = 0; i < sampleCount; i++) {
    const s = buf.readInt16LE(dataOff + i * 2)
    out[i] = s < 0 ? s / 0x8000 : s / 0x7fff
  }
  return { pcm: out, sampleRate }
}

// ---- 包络（绝对值 + 短窗 RMS）----
function envelope(pcm, sampleRate) {
  const winMs = 2
  const win = Math.max(1, Math.floor((winMs / 1000) * sampleRate))
  const out = new Float32Array(pcm.length)
  let sumSq = 0
  // 滑动窗口
  for (let i = 0; i < pcm.length; i++) {
    sumSq += pcm[i] * pcm[i]
    if (i >= win) sumSq -= pcm[i - win] * pcm[i - win]
    out[i] = Math.sqrt(sumSq / Math.min(i + 1, win))
  }
  return out
}

// ---- click 峰值检测：用 expected 时刻周围 ±searchSec 窗口找最大 envelope ----
function detectClicks(pcm, sampleRate, expectedTimesSec, searchSec = 0.3) {
  const env = envelope(pcm, sampleRate)
  const result = []
  for (const t of expectedTimesSec) {
    const center = Math.floor(t * sampleRate)
    const half = Math.floor(searchSec * sampleRate)
    const lo = Math.max(0, center - half)
    const hi = Math.min(env.length - 1, center + half)
    let bestI = lo
    let bestV = -1
    for (let i = lo; i <= hi; i++) {
      if (env[i] > bestV) {
        bestV = env[i]
        bestI = i
      }
    }
    // 信噪比：peak vs 全局 median*某个比例（粗糙）
    result.push({
      expectedSec: t,
      peakSampleIndex: bestI,
      peakSec: bestI / sampleRate,
      peakEnv: bestV,
    })
  }
  return { clicks: result, env }
}

function stats(arr) {
  if (arr.length === 0) return { n: 0 }
  const sorted = [...arr].sort((a, b) => a - b)
  const n = sorted.length
  const pick = (q) => sorted[Math.min(n - 1, Math.floor(n * q))]
  return {
    n,
    min: +sorted[0].toFixed(3),
    p50: +pick(0.5).toFixed(3),
    p95: +pick(0.95).toFixed(3),
    max: +sorted[n - 1].toFixed(3),
    mean: +(sorted.reduce((a, b) => a + b, 0) / n).toFixed(3),
  }
}

function main() {
  if (!fs.existsSync(RESULTS_DIR)) {
    console.error('no results dir:', RESULTS_DIR)
    process.exit(1)
  }
  const metaFiles = fs
    .readdirSync(RESULTS_DIR)
    .filter((f) => f.startsWith('meta-') && f.endsWith('.json'))
    .sort()
  if (metaFiles.length === 0) {
    console.error('no meta-*.json in', RESULTS_DIR)
    process.exit(1)
  }
  console.log(`found ${metaFiles.length} run(s)\n`)

  const allDriftsMs = [] // 全局：mic.peakSec - sys.peakSec，单位 ms
  const allAbsDriftsMs = []
  const perRunSummary = []
  const perClickRows = []

  for (const mf of metaFiles) {
    const meta = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, mf), 'utf8'))
    const micWav = readWavMono16(meta.micPath)
    const sysWav = readWavMono16(meta.sysPath)
    if (micWav.sampleRate !== meta.sampleRate || sysWav.sampleRate !== meta.sampleRate) {
      console.warn(`run${meta.runIndex} sampleRate mismatch — skip`)
      continue
    }
    const micDet = detectClicks(micWav.pcm, micWav.sampleRate, meta.expectedClickTimes)
    const sysDet = detectClicks(sysWav.pcm, sysWav.sampleRate, meta.expectedClickTimes)

    const driftsMs = []
    for (let k = 0; k < meta.expectedClickTimes.length; k++) {
      const m = micDet.clicks[k]
      const s = sysDet.clicks[k]
      const driftMs = (m.peakSec - s.peakSec) * 1000
      driftsMs.push(driftMs)
      allDriftsMs.push(driftMs)
      allAbsDriftsMs.push(Math.abs(driftMs))
      perClickRows.push({
        run: meta.runIndex,
        click: k + 1,
        expected_s: meta.expectedClickTimes[k],
        mic_peak_s: +m.peakSec.toFixed(4),
        sys_peak_s: +s.peakSec.toFixed(4),
        drift_ms: +driftMs.toFixed(2),
        mic_env: +m.peakEnv.toFixed(3),
        sys_env: +s.peakEnv.toFixed(3),
      })
    }
    perRunSummary.push({
      run: meta.runIndex,
      clicks: driftsMs.length,
      drift_min_ms: +Math.min(...driftsMs).toFixed(2),
      drift_max_ms: +Math.max(...driftsMs).toFixed(2),
      drift_mean_ms: +(driftsMs.reduce((a, b) => a + b, 0) / driftsMs.length).toFixed(2),
      mic_duration_s: +meta.micDurationSec.toFixed(3),
      sys_duration_s: +meta.sysDurationSec.toFixed(3),
      length_drift_ms: +((meta.micDurationSec - meta.sysDurationSec) * 1000).toFixed(2),
    })
  }

  console.log('== per-click 偏差（mic - system, ms）==')
  console.table(perClickRows)
  console.log('\n== per-run 总览 ==')
  console.table(perRunSummary)
  console.log('\n== 整体统计 ==')
  console.log('drift (有符号, ms):')
  console.table(stats(allDriftsMs))
  console.log('|drift| (绝对值, ms):')
  console.table(stats(allAbsDriftsMs))

  const p95Abs = stats(allAbsDriftsMs).p95
  console.log('\n== 判定 ==')
  if (p95Abs < 50) {
    console.log(`|drift| p95 = ${p95Abs}ms < 50ms → 不需对齐，直 sum/平均混音`)
  } else if (p95Abs < 100) {
    console.log(
      `|drift| p95 = ${p95Abs}ms ∈ [50, 100)ms → 警告：人耳可察觉边缘，M3 后期评估补偿`,
    )
  } else {
    console.log(`|drift| p95 = ${p95Abs}ms ≥ 100ms → 触发 Plan B：实现漂移补偿`)
  }

  // 写汇总 json
  const summaryPath = path.join(RESULTS_DIR, 'analysis-summary.json')
  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        perClick: perClickRows,
        perRun: perRunSummary,
        overallDriftMs: stats(allDriftsMs),
        overallAbsDriftMs: stats(allAbsDriftsMs),
        verdict:
          p95Abs < 50 ? 'no-compensation-needed' : p95Abs < 100 ? 'warn' : 'compensation-required',
      },
      null,
      2,
    ),
  )
  console.log(`\nsummary → ${summaryPath}`)
}

main()
