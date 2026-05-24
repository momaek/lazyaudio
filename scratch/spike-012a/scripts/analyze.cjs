// spike-012a analyze:读 monitor.jsonl + segments.jsonl,出 PRD §7.1 预算对照表。
//
// 用法:node scripts/analyze.cjs [<resultDir>]
//      不传则取 results/ 下最新的 run

const fs = require('node:fs')
const path = require('node:path')

const RESULTS_ROOT = path.resolve(__dirname, '..', 'results')

function pickRunDir() {
  const arg = process.argv[2]
  if (arg) {
    const p = path.isAbsolute(arg) ? arg : path.resolve(arg)
    if (!fs.existsSync(p)) throw new Error(`run dir not found: ${p}`)
    return p
  }
  if (!fs.existsSync(RESULTS_ROOT)) throw new Error(`no results dir: ${RESULTS_ROOT}`)
  const entries = fs
    .readdirSync(RESULTS_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ name: e.name, mtime: fs.statSync(path.join(RESULTS_ROOT, e.name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  if (entries.length === 0) throw new Error('no run dir under results/')
  return path.join(RESULTS_ROOT, entries[0].name)
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return []
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

function quantile(arr, q) {
  if (arr.length === 0) return NaN
  const s = [...arr].sort((a, b) => a - b)
  const i = Math.min(s.length - 1, Math.floor(q * s.length))
  return s[i]
}

function mean(arr) {
  if (arr.length === 0) return NaN
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function stats(arr) {
  return {
    n: arr.length,
    mean: mean(arr),
    p50: quantile(arr, 0.5),
    p95: quantile(arr, 0.95),
    peak: arr.length ? Math.max(...arr) : NaN,
  }
}

function fmt(x, digits = 1) {
  if (typeof x !== 'number' || !isFinite(x)) return 'NaN'
  return x.toFixed(digits)
}

function main() {
  const runDir = pickRunDir()
  console.log(`run dir: ${runDir}\n`)

  const meta = JSON.parse(fs.readFileSync(path.join(runDir, 'meta.json'), 'utf8'))
  const monitor = readJsonl(path.join(runDir, 'monitor.jsonl'))
  const segments = readJsonl(path.join(runDir, 'segments.jsonl'))

  console.log(`spike: ${meta.spike}`)
  console.log(`duration: ${meta.durationSeconds}s`)
  console.log(`electron: ${meta.electron}, node: ${meta.node}`)
  console.log(`monitor rows: ${monitor.length} | segments: ${segments.length}\n`)

  // ---- RSS ----
  const totalRss = monitor.map((m) => m.totalRssMB)
  const rssSt = stats(totalRss)
  console.log('## RSS (sum of all app processes, MB)')
  console.log(
    `   mean=${fmt(rssSt.mean)} p50=${fmt(rssSt.p50)} p95=${fmt(rssSt.p95)} peak=${fmt(rssSt.peak)}`,
  )

  // ---- per-process CPU (mean over all monitor rows) ----
  const procCpu = new Map() // type -> { cpus:[], rssPeak }
  for (const row of monitor) {
    for (const p of row.processes || []) {
      const key = p.type || 'Unknown'
      const slot = procCpu.get(key) || { cpus: [], rss: [] }
      slot.cpus.push(p.cpuPct || 0)
      slot.rss.push(p.rssMB || 0)
      procCpu.set(key, slot)
    }
  }
  console.log('\n## Per-process CPU% (Electron app.getAppMetrics)')
  for (const [type, slot] of procCpu) {
    const c = stats(slot.cpus)
    const r = stats(slot.rss)
    console.log(
      `   ${type.padEnd(10)} cpu mean=${fmt(c.mean)} p95=${fmt(c.p95)} peak=${fmt(c.peak)} | rss mean=${fmt(r.mean)} peak=${fmt(r.peak)} MB`,
    )
  }

  // ---- segments / latency / RTF ----
  const asrLatency = segments.map((s) => s.asrLatencyMs)
  const vadToAsrLatency = segments.map((s) => s.vadToAsrLatencyMs)
  const segDur = segments.map((s) => s.durationMs)
  const rtf = segments
    .map((s) => (s.durationMs > 0 ? s.asrLatencyMs / s.durationMs : 0))
    .filter((v) => v > 0)

  const asrSt = stats(asrLatency)
  const v2aSt = stats(vadToAsrLatency)
  const segSt = stats(segDur)
  const rtfSt = stats(rtf)
  console.log('\n## Segment metrics')
  console.log(`   count = ${segments.length}`)
  console.log(
    `   asrLatencyMs    mean=${fmt(asrSt.mean)} p50=${fmt(asrSt.p50)} p95=${fmt(asrSt.p95)} peak=${fmt(asrSt.peak)}`,
  )
  console.log(
    `   vadToAsrLatMs   mean=${fmt(v2aSt.mean)} p50=${fmt(v2aSt.p50)} p95=${fmt(v2aSt.p95)} peak=${fmt(v2aSt.peak)}`,
  )
  console.log(
    `   segDurMs        mean=${fmt(segSt.mean)} p50=${fmt(segSt.p50)} p95=${fmt(segSt.p95)} peak=${fmt(segSt.peak)}`,
  )
  console.log(
    `   RTF (asr/dur)   mean=${fmt(rtfSt.mean, 4)} p50=${fmt(rtfSt.p50, 4)} p95=${fmt(rtfSt.p95, 4)} peak=${fmt(rtfSt.peak, 4)}`,
  )

  // ---- Leak check: 1-10min mean vs 51-60min mean ----
  let leakResult = null
  if (meta.durationSeconds >= 3000) {
    const startedAt = meta.startedAtMs
    const window1 = monitor.filter(
      (m) => m.tMs - startedAt >= 60_000 && m.tMs - startedAt < 600_000,
    )
    const window2 = monitor.filter(
      (m) => m.tMs - startedAt >= 51 * 60_000 && m.tMs - startedAt < 60 * 60_000,
    )
    const m1 = mean(window1.map((m) => m.totalRssMB))
    const m2 = mean(window2.map((m) => m.totalRssMB))
    const drift = m1 > 0 ? ((m2 - m1) / m1) * 100 : NaN
    leakResult = {
      window1: m1,
      window2: m2,
      driftPct: drift,
      n1: window1.length,
      n2: window2.length,
    }
    console.log('\n## Leak check (RSS mean: 1-10min vs 51-60min)')
    console.log(
      `   window1 (1-10min)  mean=${fmt(m1)} MB (n=${window1.length})\n   window2 (51-60min) mean=${fmt(m2)} MB (n=${window2.length})\n   drift = ${fmt(drift, 2)} %`,
    )
  } else {
    console.log('\n## Leak check skipped (duration < 50min)')
  }

  // ---- PRD §7.1 预算对照 ----
  console.log('\n## PRD §7.1 预算对照')
  const checks = []
  const browserCpu = procCpu.get('Browser')
  const utilityCpu = procCpu.get('Utility')

  function check(label, actual, op, budget) {
    const pass = op === '<' ? actual < budget : actual <= budget
    checks.push({ label, actual, budget, pass })
    const arrow = pass ? '✓' : '✗'
    console.log(
      `   ${arrow} ${label.padEnd(28)} actual=${fmt(actual)} ${op} ${fmt(budget)} → ${pass ? 'PASS' : 'FAIL'}`,
    )
  }

  check('AC4 RSS p95 < 2.5 GB', rssSt.p95, '<', 2500)
  if (browserCpu) check('AC6 main CPU mean < 8%', mean(browserCpu.cpus), '<', 8)
  if (utilityCpu) check('AC7 utility CPU mean < 150%', mean(utilityCpu.cpus), '<', 150)
  check('AC8 Pass A RTF p95 < 0.1', rtfSt.p95, '<', 0.1)
  check('AC9 实时字幕延迟 p95 < 3000ms', v2aSt.p95, '<', 3000)
  if (leakResult && isFinite(leakResult.driftPct)) {
    check('AC5 RSS leak |drift| < 5%', Math.abs(leakResult.driftPct), '<', 5)
  }

  const passCount = checks.filter((c) => c.pass).length
  console.log(`\n  ${passCount}/${checks.length} PASS`)

  // ---- 写 summary.json ----
  const summaryPath = path.join(runDir, 'summary.json')
  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        meta,
        rss: rssSt,
        perProcessCpu: Object.fromEntries(
          [...procCpu].map(([k, v]) => [
            k,
            {
              cpu: stats(v.cpus),
              rss: stats(v.rss),
            },
          ]),
        ),
        segments: {
          count: segments.length,
          asrLatency: asrSt,
          vadToAsrLatency: v2aSt,
          segDuration: segSt,
          rtf: rtfSt,
        },
        leak: leakResult,
        checks,
        passCount,
        totalChecks: checks.length,
      },
      null,
      2,
    ),
  )
  console.log(`\n→ ${summaryPath}`)
}

main()
