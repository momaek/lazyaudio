// 临时复现:验证 sherpa-onnx-node OfflineStream 无 free() 导致的原生内存泄漏假说。
// 用法:NODE_OPTIONS=--expose-gc pnpm tsx scripts/repro-stream-leak.ts [--gc]
//   不带 --gc:纯循环 createStream,观察 RSS 是否单调涨。
//   带 --gc :每 GC_EVERY 次手动 global.gc(),观察 RSS 是否被压平。
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { createRequire } from 'node:module'

const N = 800 // 模拟长录音里的 stream 数量(Pass A 每 ~800ms 一个 hyp,~10min 量级)
const GC_EVERY = 50
const useGc = process.argv.includes('--gc')

const MODEL_KEY = 'sense-voice-zh-en-ja-ko-yue-int8-2025-09-09'
function resolveModelDir(): string {
  const cands = [
    path.resolve('.local-userdata', 'models', MODEL_KEY),
    path.join(os.homedir(), 'Library', 'Application Support', 'LazyAudio', 'models', MODEL_KEY),
  ]
  for (const d of cands) if (fs.existsSync(path.join(d, 'model.int8.onnx'))) return d
  throw new Error('找不到模型')
}

const platformDir = path.resolve('node_modules', `sherpa-onnx-${process.platform}-${process.arch}`)
process.env['SHERPA_ONNX_INSTALL_DIR'] = platformDir
const requireCjs = createRequire(path.join(process.cwd(), 'package.json'))
const sherpa = requireCjs('sherpa-onnx-node') as {
  OfflineRecognizer: new (config: unknown) => {
    createStream(): { acceptWaveform(o: { samples: Float32Array; sampleRate: number }): void }
    decode(s: unknown): void
    getResult(s: unknown): { text?: string }
  }
}

const modelDir = resolveModelDir()
const rec = new sherpa.OfflineRecognizer({
  modelConfig: {
    senseVoice: {
      model: path.join(modelDir, 'model.int8.onnx'),
      language: 'auto',
      useInverseTextNormalization: 1,
    },
    tokens: path.join(modelDir, 'tokens.txt'),
    numThreads: 2,
    provider: 'cpu',
    debug: 0,
  },
})

// 13s @16k 噪声(对齐 Pass A 段长上限);内容无所谓,测的是内存
const samples = new Float32Array(16000 * 13)
for (let i = 0; i < samples.length; i++) samples[i] = (i % 97) / 97 - 0.5

const rssMb = (): number => process.memoryUsage().rss / 1024 / 1024
console.info(
  `mode=${useGc ? 'WITH gc' : 'NO gc'}  gcAvail=${typeof global.gc === 'function'}  N=${N}`,
)
console.info(`start RSS ${rssMb().toFixed(0)} MB`)

for (let i = 1; i <= N; i++) {
  const s = rec.createStream()
  s.acceptWaveform({ samples, sampleRate: 16000 })
  rec.decode(s)
  rec.getResult(s)
  if (useGc && i % GC_EVERY === 0 && typeof global.gc === 'function') global.gc()
  if (i % 100 === 0)
    console.info(`  after ${String(i).padStart(4)} streams  RSS ${rssMb().toFixed(0)} MB`)
}
if (typeof global.gc === 'function') global.gc()
console.info(`end RSS ${rssMb().toFixed(0)} MB (post final gc)`)
