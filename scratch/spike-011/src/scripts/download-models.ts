// 下载 spike-011 用的 3 个模型
// - SenseVoice int8 2025-09-09(B 路 + Pass B 复用)
// - Silero VAD(B 路切片)
// - Streaming Zipformer bilingual zh-en 2023-02-20(A 路;GH release 404,走 HuggingFace 个别文件)
//
// 模型大,不进 git。重跑只下缺的。
import { createWriteStream, existsSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MODELS_DIR = path.resolve(__dirname, '../../models')

mkdirSync(MODELS_DIR, { recursive: true })

type Target = {
  name: string
  destSubdir: string
  url: string
  kind: 'tarball' | 'file'
  // tarball 解压后预期文件,用来跳过已下载
  sentinel?: string
}

const TARGETS: Target[] = [
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
  // streaming Zipformer:GH release tar.bz2 502,走 HuggingFace 单文件
  // 模型由 encoder/decoder/joiner 三件构成,加 tokens.txt
  // 来源:https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20
]

const STREAMING_ZIPFORMER_FILES = [
  'encoder-epoch-99-avg-1.int8.onnx',
  'decoder-epoch-99-avg-1.onnx',
  'joiner-epoch-99-avg-1.int8.onnx',
  'tokens.txt',
]
const STREAMING_ZIPFORMER_BASE =
  'https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20/resolve/main'
const STREAMING_ZIPFORMER_DIR = 'streaming-zipformer'

async function downloadFile(url: string, dest: string): Promise<void> {
  console.log(`  ↓ ${url}`)
  console.log(`    → ${dest}`)
  const t0 = Date.now()
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status} for ${url}`)
  }
  const total = Number(res.headers.get('content-length') ?? 0)
  let got = 0
  let lastLog = 0
  const stream = createWriteStream(dest)
  // @ts-expect-error fetch body is ReadableStream<Uint8Array>
  await pipeline(
    res.body,
    async function* (src) {
      for await (const chunk of src as AsyncIterable<Uint8Array>) {
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

async function ensureTarget(t: Target): Promise<void> {
  const destDir = path.join(MODELS_DIR, t.destSubdir)
  mkdirSync(destDir, { recursive: true })

  if (t.sentinel) {
    const sentinelPath = path.join(destDir, t.sentinel)
    if (existsSync(sentinelPath)) {
      console.log(`✓ ${t.name} already in place (${t.sentinel})`)
      return
    }
  }

  console.log(`→ ${t.name}`)

  if (t.kind === 'tarball') {
    const tmpFile = path.join(destDir, 'download.tar.bz2')
    await downloadFile(t.url, tmpFile)
    console.log(`  ↪ extracting...`)
    execFileSync('tar', ['-xjf', tmpFile, '-C', destDir], { stdio: 'inherit' })
    execFileSync('rm', [tmpFile])
    console.log(`  ✓ extracted to ${destDir}`)
  } else {
    const dest = path.join(destDir, path.basename(t.url))
    await downloadFile(t.url, dest)
  }
}

async function ensureStreamingZipformer(): Promise<void> {
  const destDir = path.join(MODELS_DIR, STREAMING_ZIPFORMER_DIR)
  mkdirSync(destDir, { recursive: true })

  const allPresent = STREAMING_ZIPFORMER_FILES.every((f) => existsSync(path.join(destDir, f)))
  if (allPresent) {
    console.log('✓ Streaming Zipformer (bilingual zh-en 2023-02-20) already in place')
    return
  }

  console.log('→ Streaming Zipformer bilingual zh-en 2023-02-20 (4 files from HuggingFace)')
  for (const file of STREAMING_ZIPFORMER_FILES) {
    const dest = path.join(destDir, file)
    if (existsSync(dest)) continue
    await downloadFile(`${STREAMING_ZIPFORMER_BASE}/${file}`, dest)
  }
}

async function ensureStreamingTestWavs(): Promise<void> {
  const FIXTURES_DIR = path.resolve(__dirname, '../../fixtures')
  mkdirSync(FIXTURES_DIR, { recursive: true })
  const base =
    'https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20/resolve/main/test_wavs'
  for (const n of [0, 1, 2, 3]) {
    const dest = path.join(FIXTURES_DIR, `streaming-${n}.wav`)
    if (existsSync(dest)) continue
    console.log(`→ fixture streaming-${n}.wav`)
    await downloadFile(`${base}/${n}.wav`, dest)
  }
  // SenseVoice 自带的 zh.wav 也拷一份过来,方便统一处理
  const zhSrc = path.join(
    MODELS_DIR,
    'sense-voice',
    'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09',
    'test_wavs',
    'zh.wav',
  )
  const zhDest = path.join(FIXTURES_DIR, 'sense-voice-zh.wav')
  if (existsSync(zhSrc) && !existsSync(zhDest)) {
    execFileSync('cp', [zhSrc, zhDest])
    console.log(`✓ copied sense-voice-zh.wav`)
  }
}

async function main(): Promise<void> {
  console.log(`models dir: ${MODELS_DIR}`)
  for (const t of TARGETS) await ensureTarget(t)
  await ensureStreamingZipformer()
  await ensureStreamingTestWavs()
  console.log('\nAll models + fixtures in place.')
}

main().catch((e: unknown) => {
  console.error('FATAL:', e)
  process.exitCode = 1
})
