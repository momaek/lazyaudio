// 快速检查 wav 是否真的有信号：按 100ms 窗口算 RMS + 全文件 max abs
// 用法：node src/inspect-wav.mjs [resultsDir]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dir = process.argv[2] || path.join(__dirname, '..', 'results')

function readWavMono16(filePath) {
  const buf = fs.readFileSync(filePath)
  const channels = buf.readUInt16LE(22)
  const sampleRate = buf.readUInt32LE(24)
  const bits = buf.readUInt16LE(34)
  if (channels !== 1 || bits !== 16) throw new Error(`unexpected ch=${channels} bits=${bits}`)
  let off = 12,
    dataOff = -1,
    dataLen = 0
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
  const sampleCount = dataLen / 2
  const out = new Float32Array(sampleCount)
  for (let i = 0; i < sampleCount; i++) {
    const s = buf.readInt16LE(dataOff + i * 2)
    out[i] = s < 0 ? s / 0x8000 : s / 0x7fff
  }
  return { pcm: out, sampleRate }
}

function inspect(filePath) {
  const { pcm, sampleRate } = readWavMono16(filePath)
  const winSamples = Math.floor(0.1 * sampleRate) // 100ms 窗
  let maxAbs = 0
  for (let i = 0; i < pcm.length; i++) {
    const a = Math.abs(pcm[i])
    if (a > maxAbs) maxAbs = a
  }
  const windows = []
  for (let w = 0; w + winSamples <= pcm.length; w += winSamples) {
    let ss = 0
    for (let i = 0; i < winSamples; i++) {
      const v = pcm[w + i]
      ss += v * v
    }
    windows.push(Math.sqrt(ss / winSamples))
  }
  console.log(`\n${path.basename(filePath)}:`)
  console.log(`  samples=${pcm.length}, sec=${(pcm.length / sampleRate).toFixed(3)}, sr=${sampleRate}`)
  console.log(`  maxAbs=${maxAbs.toFixed(6)} (${maxAbs > 0.001 ? 'has signal' : 'SILENT or near-silent'})`)
  // 打印 100ms RMS 曲线（每 5 个一行，~500ms）
  const rmsLine = windows
    .map((r, idx) => `${(idx * 0.1).toFixed(1)}s:${r.toFixed(4)}`)
    .reduce((acc, s, i) => {
      if (i % 5 === 0) acc.push([])
      acc[acc.length - 1].push(s)
      return acc
    }, [])
    .map((row) => '  ' + row.join('  '))
    .join('\n')
  console.log(rmsLine)
}

const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.wav'))
  .sort()
for (const f of files) {
  inspect(path.join(dir, f))
}
