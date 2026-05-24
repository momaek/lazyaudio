// 下 spike-012a 需要的模型:
// - SenseVoice int8 2025-09-09 (~158 MB,tar.bz2)
// - Silero VAD (~2 MB,单文件)
// 已存在则跳过。模型不进 git。
// 抄 spike-011/src/scripts/download-models.ts 简化为 CJS。

const { createWriteStream, existsSync, mkdirSync } = require('node:fs')
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const { pipeline } = require('node:stream/promises')

const MODELS_DIR = path.resolve(__dirname, '..', 'models')
mkdirSync(MODELS_DIR, { recursive: true })

const TARGETS = [
  {
    name: 'SenseVoice int8 2025-09-09',
    destSubdir: 'sense-voice',
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09.tar.bz2',
    kind: 'tarball',
    sentinel: 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09/model.int8.onnx',
  },
  {
    name: 'Silero VAD',
    destSubdir: 'silero-vad',
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx',
    kind: 'file',
    sentinel: 'silero_vad.onnx',
  },
]

async function downloadFile(url, dest) {
  console.log(`  ↓ ${url}`)
  console.log(`    → ${dest}`)
  const t0 = Date.now()
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`)
  const total = Number(res.headers.get('content-length') ?? 0)
  let got = 0
  let lastLog = 0
  const stream = createWriteStream(dest)
  await pipeline(
    res.body,
    async function* (src) {
      for await (const chunk of src) {
        got += chunk.length
        if (total > 0 && Date.now() - lastLog > 1500) {
          const pct = ((got / total) * 100).toFixed(1)
          const mb = (got / 1024 / 1024).toFixed(1)
          const mbs = (got / 1024 / 1024 / ((Date.now() - t0) / 1000)).toFixed(2)
          process.stdout.write(`    ${pct}% (${mb} MB, ${mbs} MB/s)\r`)
          lastLog = Date.now()
        }
        yield chunk
      }
    },
    stream,
  )
  const sec = ((Date.now() - t0) / 1000).toFixed(1)
  const mb = (got / 1024 / 1024).toFixed(1)
  console.log(`    ✓ ${mb} MB in ${sec}s`)
}

async function ensureTarget(t) {
  const destDir = path.join(MODELS_DIR, t.destSubdir)
  mkdirSync(destDir, { recursive: true })
  if (t.sentinel && existsSync(path.join(destDir, t.sentinel))) {
    console.log(`✓ ${t.name} already in place`)
    return
  }
  console.log(`→ ${t.name}`)
  if (t.kind === 'tarball') {
    const tmpFile = path.join(destDir, 'download.tar.bz2')
    await downloadFile(t.url, tmpFile)
    console.log('  ↪ extracting...')
    execFileSync('tar', ['-xjf', tmpFile, '-C', destDir], { stdio: 'inherit' })
    execFileSync('rm', [tmpFile])
    console.log(`  ✓ extracted to ${destDir}`)
  } else {
    const dest = path.join(destDir, path.basename(t.url))
    await downloadFile(t.url, dest)
  }
}

async function main() {
  console.log(`models dir: ${MODELS_DIR}`)
  for (const t of TARGETS) await ensureTarget(t)
  console.log('\nAll models in place.')
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exitCode = 1
})
