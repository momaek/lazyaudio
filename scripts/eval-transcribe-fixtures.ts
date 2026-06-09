// T61 评测基建 — 离线 Pass B fixture 评测脚本(dev-plan §6.2.6 / §6.2.7)。
//
// 「先量化,再优化」:每次转录优化前后跑同一批 fixture,产出 CER / 术语命中率 / RTF / RSS 的
// 对比数据。复用产品同一条 Pass B 识别链(workers/asr/recognize.ts),保证评测口径 = 真实链路。
//
// 用法:
//   pnpm tsx scripts/eval-transcribe-fixtures.ts [fixturesDir]
//   pnpm tsx scripts/eval-transcribe-fixtures.ts --model <modelDir> --json out.json --strip-punct
//
// 分段口径默认 = 生产 Pass B(定窗 ~15s)。`--vad` 是实验性 opt-in(Silero VAD 分段),
// 经 dogfood A/B 否决(CER 回退),保留作将来调参对照;见 tech-feasibility「Pass B VAD 分段实验」。
//
// 模型目录默认探测顺序:--model > $LAZY_MODEL_DIR > .local-userdata/models/<KEY> >
//   ~/Library/Application Support/LazyAudio/models/<KEY>
//
// fixture 约定见 fixtures/transcribe/README.md。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import {
  loadRecognizer,
  recognizeSamples,
  recognizeSamplesVad,
  readWav16kMono,
  type SherpaModule,
  type VadInstance,
} from '../src/main/workers/asr/recognize'

const SAMPLE_RATE = 16000
const DEFAULT_MODEL_KEY = 'sense-voice-zh-en-ja-ko-yue-int8-2025-09-09'
const SILERO_KEY = 'silero-vad-v5'
// sherpa-onnx-node 无类型声明;VAD 分段需要 Vad 构造器
interface EvalSherpa extends SherpaModule {
  Vad: new (config: unknown, bufferSizeInSeconds: number) => VadInstance
}
// 输入音频扩展名(.wav 走内置 RIFF 解析;其余走 ffmpeg 解码)
const AUDIO_EXTS = [
  '.wav',
  '.m4a',
  '.mp3',
  '.flac',
  '.aac',
  '.ogg',
  '.opus',
  '.mp4',
  '.mov',
  '.webm',
]

interface Args {
  fixturesDir: string
  modelDir: string | null
  jsonOut: string | null
  lang: string
  stripPunct: boolean
  dumpHyp: boolean
  useVad: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    fixturesDir: 'fixtures/transcribe',
    modelDir: null,
    jsonOut: null,
    lang: 'auto',
    stripPunct: false,
    dumpHyp: false,
    useVad: false, // 默认 = 生产 Pass B(定窗);--vad 是实验性 opt-in
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--model') args.modelDir = argv[++i] ?? null
    else if (a === '--json') args.jsonOut = argv[++i] ?? null
    else if (a === '--lang') args.lang = argv[++i] ?? 'auto'
    else if (a === '--strip-punct') args.stripPunct = true
    else if (a === '--dump-hyp') args.dumpHyp = true
    else if (a === '--vad') args.useVad = true
    else if (a && !a.startsWith('--')) args.fixturesDir = a
  }
  return args
}

/** 平台子包目录(含 .node + 平台二进制),dev 下 node_modules 在源码树 */
function resolveSherpaPlatformDir(): string {
  const platform = process.platform === 'win32' ? 'win' : process.platform
  return path.resolve('node_modules', `sherpa-onnx-${platform}-${process.arch}`)
}

/** 探测 SenseVoice 模型目录:命中含 model.int8.onnx 的第一个候选 */
function resolveModelDir(explicit: string | null): string {
  const candidates = [
    explicit,
    process.env['LAZY_MODEL_DIR'],
    path.resolve('.local-userdata', 'models', DEFAULT_MODEL_KEY),
    path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'LazyAudio',
      'models',
      DEFAULT_MODEL_KEY,
    ),
  ].filter((c): c is string => !!c)
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'model.int8.onnx'))) return dir
  }
  throw new Error(
    `找不到 SenseVoice 模型(model.int8.onnx)。试过:\n  ${candidates.join('\n  ')}\n` +
      `用 --model <dir> 或 $LAZY_MODEL_DIR 指定。`,
  )
}

/** silero_vad.onnx:SenseVoice 模型目录的同级 silero-vad-v5/。找不到返回 null(回退定窗) */
function resolveSileroPath(senseDir: string): string | null {
  const p = path.join(path.dirname(senseDir), SILERO_KEY, 'silero_vad.onnx')
  return fs.existsSync(p) ? p : null
}

/** 构造 Silero VAD(配置对齐生产 Pass B / Pass A worker) */
function createEvalVad(sherpa: EvalSherpa, vadModelPath: string): VadInstance {
  return new sherpa.Vad(
    {
      sileroVad: {
        model: vadModelPath,
        threshold: 0.5,
        minSilenceDuration: 0.4,
        minSpeechDuration: 0.25,
        maxSpeechDuration: 30,
        windowSize: 512,
      },
      sampleRate: 16000,
      numThreads: 1,
      provider: 'cpu',
      debug: false,
    },
    60,
  )
}

/** 规范化:去所有空白 + ASCII 转小写;stripPunct 时再去常见标点 */
function normalize(text: string, stripPunct: boolean): string {
  let s = text.replace(/\s+/g, '').toLowerCase()
  if (stripPunct) {
    // 中英常见标点(不动汉字 / 字母 / 数字)
    s = s.replace(/[.,!?;:'"`~@#$%^&*()_+\-=[\]{}\\|/<>。,、!?;:""''（）【】《》—…·]/g, '')
  }
  return s
}

/** 字符级 Levenshtein 编辑距离(两行 DP) */
function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let prev = new Array<number>(b.length + 1)
  let cur = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    const ai = a.charCodeAt(i - 1)
    for (let j = 1; j <= b.length; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost)
    }
    ;[prev, cur] = [cur, prev]
  }
  return prev[b.length]!
}

/** terms.json → 期望命中的专有名词列表(数组直接用;对象取 value 侧) */
function loadExpectedTerms(termsPath: string): string[] {
  if (!fs.existsSync(termsPath)) return []
  const raw = JSON.parse(fs.readFileSync(termsPath, 'utf8')) as unknown
  let terms: string[]
  if (Array.isArray(raw)) terms = raw.map(String)
  else if (raw && typeof raw === 'object') terms = Object.values(raw as Record<string, string>)
  else terms = []
  return [...new Set(terms.map((t) => t.trim()).filter(Boolean))]
}

/** 用 ffmpeg 把任意音频解码成 16k mono Float32([-1,1])。dev 工具,不进产品 runtime(§6.2.7 P2)。 */
function decodeViaFfmpeg(inputPath: string): Float32Array {
  let raw: Buffer
  try {
    raw = execFileSync(
      'ffmpeg',
      ['-v', 'error', '-i', inputPath, '-f', 'f32le', '-ac', '1', '-ar', String(SAMPLE_RATE), '-'],
      { maxBuffer: 1024 * 1024 * 1024 }, // 1GB:够装小时级 16k mono f32
    )
  } catch (err) {
    throw new Error(
      `ffmpeg 解码失败(${path.basename(inputPath)}):${err instanceof Error ? err.message : String(err)}\n` +
        `非 .wav 输入需要 ffmpeg(brew install ffmpeg),或先自行转成 16k mono wav。`,
    )
  }
  // Buffer → Float32Array(按 4 字节对齐截断尾部不完整样本)
  const n = Math.floor(raw.byteLength / 4)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = raw.readFloatLE(i * 4)
  return out
}

/** 读输入音频 → 16k mono Float32。.wav 走内置解析(无外部依赖),其余走 ffmpeg。 */
function decodeAudio16kMono(inputPath: string): Float32Array {
  if (inputPath.toLowerCase().endsWith('.wav')) return readWav16kMono(inputPath).samples
  return decodeViaFfmpeg(inputPath)
}

/** SRT → 纯文本:去序号行、时间轴行(含 -->)、空行,拼正文 */
function parseSrt(srt: string): string {
  const out: string[] = []
  for (const line of srt.split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    if (t.includes('-->')) continue
    if (/^\d+$/.test(t)) continue
    out.push(t.replace(/<[^>]+>/g, '')) // 去 <i>/<b> 之类标签
  }
  return out.join('')
}

/** 参考稿:优先 <base>.ref.txt,其次 <base>.srt。返回 null 表示无 ref */
function loadReference(base: string): string | null {
  const txt = `${base}.ref.txt`
  if (fs.existsSync(txt)) return fs.readFileSync(txt, 'utf8')
  const srt = `${base}.srt`
  if (fs.existsSync(srt)) return parseSrt(fs.readFileSync(srt, 'utf8'))
  return null
}

interface SampleResult {
  id: string
  audioSec: number
  procMs: number
  rtf: number
  cer: number
  refChars: number
  termHitRate: number | null
  termsTotal: number
  termsHit: number
}

function fmtPct(x: number): string {
  return (x * 100).toFixed(1) + '%'
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const fixturesDir = path.resolve(args.fixturesDir)

  if (!fs.existsSync(fixturesDir)) {
    console.error(`fixtures 目录不存在:${fixturesDir}\n见 fixtures/transcribe/README.md。`)
    process.exit(1)
  }
  const audioFiles = fs
    .readdirSync(fixturesDir)
    .filter((f) => AUDIO_EXTS.includes(path.extname(f).toLowerCase()))
    .sort()
  if (audioFiles.length === 0) {
    console.error(
      `${fixturesDir} 里没有音频样本(${AUDIO_EXTS.join('/')})。\n` +
        `按 fixtures/transcribe/README.md 放 sample-NNN.{wav|m4a,ref.txt|srt,terms.json}。`,
    )
    process.exit(1)
  }

  const modelDir = resolveModelDir(args.modelDir)
  const platformDir = resolveSherpaPlatformDir()
  process.env['SHERPA_ONNX_INSTALL_DIR'] = platformDir

  console.info(`模型:${modelDir}`)
  console.info(`平台包:${platformDir}`)
  console.info(`样本:${audioFiles.length} 段 @ ${fixturesDir}\n`)

  // package.json type=module → 用 createRequire 加载 CJS N-API addon(sherpa-onnx-node)
  const requireCjs = createRequire(path.join(process.cwd(), 'package.json'))
  const sherpa = requireCjs('sherpa-onnx-node') as EvalSherpa
  const rec = loadRecognizer(sherpa, modelDir, args.lang)

  // 分段口径必须 = 生产 Pass B:默认 VAD 分段;--no-vad 退回定窗(用于 A/B 量改动收益)
  const sileroPath = args.useVad ? resolveSileroPath(modelDir) : null
  if (args.useVad && !sileroPath) {
    console.info('提示:未找到 silero_vad.onnx,本次回退定窗切片(等价 --no-vad)')
  }
  console.info(`分段:${sileroPath ? 'VAD(silero)' : '定窗 15s'}\n`)

  const results: SampleResult[] = []
  let rssPeakMb = 0

  for (const file of audioFiles) {
    const id = file.replace(new RegExp(`\\${path.extname(file)}$`), '')
    const base = path.join(fixturesDir, id)
    const samples = decodeAudio16kMono(path.join(fixturesDir, file))
    const audioSec = samples.length / SAMPLE_RATE

    const t0 = performance.now()
    // 每段新建 VAD,避免跨文件残留内部状态
    const vad = sileroPath ? createEvalVad(sherpa, sileroPath) : null
    const segments = vad
      ? recognizeSamplesVad(rec, vad, samples, () => {})
      : recognizeSamples(rec, samples, () => {})
    const procMs = performance.now() - t0
    const rss = process.memoryUsage().rss / 1024 / 1024
    if (rss > rssPeakMb) rssPeakMb = rss

    const hyp = segments.map((s) => s.text).join('')
    if (args.dumpHyp) fs.writeFileSync(`${base}.hyp.txt`, hyp)
    const ref = loadReference(base)
    const hasRef = ref !== null
    const refN = normalize(ref ?? '', args.stripPunct)
    const hypN = normalize(hyp, args.stripPunct)
    const cer = hasRef && refN.length > 0 ? editDistance(refN, hypN) / refN.length : NaN

    const terms = loadExpectedTerms(`${base}.terms.json`)
    const hypLower = hyp.toLowerCase()
    const termsHit = terms.filter((t) => hypLower.includes(t.toLowerCase())).length
    const termHitRate = terms.length > 0 ? termsHit / terms.length : null

    results.push({
      id,
      audioSec,
      procMs,
      rtf: procMs / 1000 / audioSec,
      cer,
      refChars: refN.length,
      termHitRate,
      termsTotal: terms.length,
      termsHit,
    })

    const cerStr = Number.isNaN(cer) ? '  (无 ref) ' : fmtPct(cer).padStart(7)
    const termStr = termHitRate === null ? '  (无 terms)' : `${termsHit}/${terms.length}`
    console.info(
      `${id.padEnd(16)} ${audioSec.toFixed(1).padStart(6)}s  ` +
        `RTF ${(procMs / 1000 / audioSec).toFixed(3)}  CER ${cerStr}  术语 ${termStr}`,
    )
  }

  // 汇总(CER / termHitRate 跳过无标注样本)
  const cerVals = results.map((r) => r.cer).filter((x) => !Number.isNaN(x))
  const termVals = results.map((r) => r.termHitRate).filter((x): x is number => x !== null)
  const mean = (xs: number[]): number =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN
  const meanCer = mean(cerVals)
  const meanTerm = mean(termVals)
  const meanRtf = mean(results.map((r) => r.rtf))

  console.info('\n— 汇总 —')
  console.info(`样本数        ${results.length}`)
  console.info(
    `平均 CER      ${Number.isNaN(meanCer) ? 'N/A' : fmtPct(meanCer)} (${cerVals.length} 段有 ref)`,
  )
  console.info(
    `平均术语命中  ${Number.isNaN(meanTerm) ? 'N/A' : fmtPct(meanTerm)} (${termVals.length} 段有 terms)`,
  )
  console.info(`平均 RTF      ${meanRtf.toFixed(3)}`)
  console.info(`RSS 峰值      ${rssPeakMb.toFixed(0)} MB`)

  if (args.jsonOut) {
    const payload = {
      modelDir,
      fixturesDir,
      stripPunct: args.stripPunct,
      summary: {
        samples: results.length,
        cer: Number.isNaN(meanCer) ? null : meanCer,
        termHitRate: Number.isNaN(meanTerm) ? null : meanTerm,
        rtf: meanRtf,
        rssPeakMb: Math.round(rssPeakMb),
      },
      perSample: results,
    }
    fs.writeFileSync(args.jsonOut, JSON.stringify(payload, null, 2))
    console.info(`\n已写 ${args.jsonOut}`)
  }
}

main()
