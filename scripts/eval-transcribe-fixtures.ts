// T61 评测基建 — fixture 转录评测脚本(dev-plan §6.2.6 / §6.2.7)。
//
// 「先量化,再优化」:每次转录优化前后跑同一批 fixture,产出 CER / 术语命中率 / RTF / RSS 的
// 对比数据。复用产品同一条识别链,保证评测口径 = 真实链路。
//
// 两种模式:
//   - 默认 = Pass B 离线(workers/asr/recognize.ts,定窗切片)。
//   - `--pass-a` = Pass A 实时模拟:把音频切块喂真实 VadStream(streaming-asr),收 confirmed 段算 CER,
//     量 Pass A 的 RTF(含 hypothesis 重识别开销)+ 段数 / 改写数。`--realtime` 按 1x 节奏喂(慢,但
//     让 latency 埋点真实;不加则尽快喂,只看 CER/RTF/计算量)。
//
// 用法:
//   pnpm tsx scripts/eval-transcribe-fixtures.ts [fixturesDir]
//   pnpm tsx scripts/eval-transcribe-fixtures.ts --pass-a [--realtime] --json out.json
//   pnpm tsx scripts/eval-transcribe-fixtures.ts --model <modelDir> --strip-punct --dump-hyp
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
  readWav16kMono,
  type SherpaModule,
} from '../src/main/workers/asr/recognize'
import { VadStream } from '../src/main/workers/streaming-asr/vad-stream'
import {
  noopPassAMetrics,
  type PassAMetrics,
} from '../src/main/workers/streaming-asr/passa-metrics'
import type { LiveSegment } from '@shared/transcribe/streaming-protocol'

const SAMPLE_RATE = 16000
const DEFAULT_MODEL_KEY = 'sense-voice-zh-en-ja-ko-yue-int8-2025-09-09'
const SILERO_KEY = 'silero-vad-v5'
// sherpa-onnx-node 无类型声明;Pass A 需要 Vad 构造器
interface EvalSherpa extends SherpaModule {
  Vad: new (
    config: unknown,
    bufferSizeInSeconds: number,
  ) => {
    acceptWaveform(s: Float32Array): void
    isDetected(): boolean
    isEmpty(): boolean
    pop(): void
  }
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
  passA: boolean
  realtime: boolean
  normNum: boolean
  stripFillers: boolean
  only: string | null // 内部:子进程模式,只跑这一个 fixture 文件名
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    fixturesDir: 'fixtures/transcribe',
    modelDir: null,
    jsonOut: null,
    lang: 'auto',
    stripPunct: false,
    dumpHyp: false,
    passA: false,
    realtime: false,
    normNum: true,
    stripFillers: true,
    only: null,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--model') args.modelDir = argv[++i] ?? null
    else if (a === '--json') args.jsonOut = argv[++i] ?? null
    else if (a === '--lang') args.lang = argv[++i] ?? 'auto'
    else if (a === '--strip-punct') args.stripPunct = true
    else if (a === '--dump-hyp') args.dumpHyp = true
    else if (a === '--pass-a') args.passA = true
    else if (a === '--realtime') args.realtime = true
    else if (a === '--no-norm-num') args.normNum = false
    else if (a === '--keep-fillers') args.stripFillers = false
    else if (a === '--only') args.only = argv[++i] ?? null
    else if (a && !a.startsWith('--')) args.fixturesDir = a
  }
  return args
}

/** 把 args 还原成子进程命令行 flag(不含 --json / --only,父进程自己管) */
function childFlags(args: Args): string[] {
  const f: string[] = [args.fixturesDir]
  if (args.modelDir) f.push('--model', args.modelDir)
  if (args.lang !== 'auto') f.push('--lang', args.lang)
  if (args.stripPunct) f.push('--strip-punct')
  if (args.dumpHyp) f.push('--dump-hyp')
  if (args.passA) f.push('--pass-a')
  if (args.realtime) f.push('--realtime')
  if (!args.normNum) f.push('--no-norm-num')
  if (!args.stripFillers) f.push('--keep-fillers')
  return f
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

/** silero_vad.onnx:SenseVoice 模型目录的同级 silero-vad-v5/。Pass A 必需,找不到返回 null */
function resolveSileroPath(senseDir: string): string | null {
  const p = path.join(path.dirname(senseDir), SILERO_KEY, 'silero_vad.onnx')
  return fs.existsSync(p) ? p : null
}

/** 构造 Silero VAD(配置对齐生产 Pass A worker) */
function createEvalVad(sherpa: EvalSherpa, vadModelPath: string): InstanceType<EvalSherpa['Vad']> {
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

/** Float32[-1,1] → Int16(VadStream.pushInt16 的输入,= 生产采集格式) */
function f32ToI16(f: Float32Array): Int16Array {
  const o = new Int16Array(f.length)
  for (let i = 0; i < f.length; i++) {
    const x = Math.max(-1, Math.min(1, f[i] ?? 0))
    o[i] = x < 0 ? x * 32768 : x * 32767
  }
  return o
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Pass A 实时模拟:切块喂 VadStream,收 confirmed 段。computeMs 只计 push/flush 计算时间(排除 sleep)。 */
async function runPassA(
  rec: ReturnType<typeof loadRecognizer>,
  vad: InstanceType<EvalSherpa['Vad']>,
  samples: Float32Array,
  realtime: boolean,
): Promise<{ text: string; segCount: number; hypCount: number; computeMs: number }> {
  const int16 = f32ToI16(samples)
  const confirmed: LiveSegment[] = []
  let hypCount = 0
  let computeMs = 0
  const metrics: PassAMetrics = noopPassAMetrics
  const vs = new VadStream(
    rec as never,
    vad as never,
    'mixed',
    (seg: LiveSegment) => {
      if (seg.stability === 'confirmed') confirmed.push(seg)
      else hypCount++
    },
    () => {},
    metrics,
  )
  const CHUNK = 1600 // 100ms @16k(模拟采集 chunk)
  for (let p = 0; p < int16.length; p += CHUNK) {
    const t0 = performance.now()
    vs.pushInt16(int16.subarray(p, Math.min(p + CHUNK, int16.length)))
    computeMs += performance.now() - t0
    if (realtime) await sleep((CHUNK / SAMPLE_RATE) * 1000)
  }
  const tf = performance.now()
  vs.flush()
  computeMs += performance.now() - tf
  confirmed.sort((a, b) => a.start - b.start)
  return {
    text: confirmed.map((s) => s.text).join(''),
    segCount: confirmed.length,
    hypCount,
    computeMs,
  }
}

// 中文数字 → 阿拉伯。两边都转,消除「二零二五 vs 2025」「百分之六十 vs 60%」「七家 vs 7家」这类
// 格式假错(字幕用书面数字,SenseVoice 输出口语数字)。对称归一:普通文本(一样/第一)两边同样转,
// 不会制造新差异;只会让纯数字格式差异消失。非完美 Chinese-number 解析,但够消格式噪声。
const CN_DIGIT: Record<string, number> = {
  〇: 0,
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
}
const CN_SMALL_UNIT: Record<string, number> = { 十: 10, 百: 100, 千: 1000 }

function cnRunToArabic(run: string): string {
  // 纯数字串(无单位)→ 直接拼,处理年份 / 编号:二零二五 → 2025
  if (/^[〇零一二三四五六七八九]+$/.test(run)) {
    return [...run].map((c) => String(CN_DIGIT[c] ?? 0)).join('')
  }
  let total = 0
  let section = 0
  let number = 0
  for (const ch of run) {
    if (ch in CN_DIGIT) number = CN_DIGIT[ch]!
    else if (ch in CN_SMALL_UNIT) {
      section += (number || 1) * CN_SMALL_UNIT[ch]!
      number = 0
    } else if (ch === '万') {
      total += (section + number) * 10000
      section = 0
      number = 0
    } else if (ch === '亿') {
      total += (section + number) * 100000000
      section = 0
      number = 0
    }
  }
  return String(total + section + number)
}

function normalizeNumbers(s: string): string {
  // 去掉百分号标记(百分之X / X% 两种写法都归零),再转中文数字
  return s
    .replace(/百分之/g, '')
    .replace(/[%％]/g, '')
    .replace(/[〇零一二两三四五六七八九十百千万亿]+/g, (m) => cnRunToArabic(m))
}

/** 规范化:去空白 + ASCII 小写;normNum 时数字归一;stripFillers 时剥纯语气词;stripPunct 时去标点 */
function normalize(
  text: string,
  stripPunct: boolean,
  normNum: boolean,
  stripFillers: boolean,
): string {
  let s = text.replace(/\s+/g, '').toLowerCase()
  if (normNum) s = normalizeNumbers(s)
  if (stripFillers) {
    // 纯语气词对称剥除:视频字幕普遍删「嗯/啊/呃」,模型听到写出来不该算插入错
    // (dogfood 实测:roundtable 类 hyp 比字幕多 ~140 处语气词 ≈ 2.2-2.5% 假 CER)。
    // 只剥单字语气词,「就是/然后/那个」是真词不动。
    s = s.replace(/[嗯呃哦诶唉啊呀嘛]/g, '')
  }
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
  segCount?: number | undefined // Pass A only
  hypCount?: number | undefined // Pass A only
  rssMb?: number | undefined // 子进程模式:该 fixture 独立进程的 RSS(不含跨文件泄漏)
}

function fmtPct(x: number): string {
  return (x * 100).toFixed(1) + '%'
}

interface EvalContext {
  sherpa: EvalSherpa
  rec: ReturnType<typeof loadRecognizer>
  sileroPath: string | null
  modelDir: string
  platformDir: string
  fixturesDir: string
}

/** 加载模型 / sherpa / recognizer(子进程跑单 fixture 用;父进程不碰) */
function loadContext(args: Args): EvalContext {
  const fixturesDir = path.resolve(args.fixturesDir)
  const modelDir = resolveModelDir(args.modelDir)
  const platformDir = resolveSherpaPlatformDir()
  process.env['SHERPA_ONNX_INSTALL_DIR'] = platformDir
  // package.json type=module → 用 createRequire 加载 CJS N-API addon(sherpa-onnx-node)
  const requireCjs = createRequire(path.join(process.cwd(), 'package.json'))
  const sherpa = requireCjs('sherpa-onnx-node') as EvalSherpa
  const rec = loadRecognizer(sherpa, modelDir, args.lang)
  let sileroPath: string | null = null
  if (args.passA) {
    sileroPath = resolveSileroPath(modelDir)
    if (!sileroPath) {
      console.error(`Pass A 需要 silero_vad.onnx(${SILERO_KEY}/),在模型目录同级没找到。`)
      process.exit(1)
    }
  }
  return { sherpa, rec, sileroPath, modelDir, platformDir, fixturesDir }
}

/** 转录 + 评测单个 fixture → SampleResult(含本进程 RSS)。无 console 输出,供子进程调用。 */
async function processFixture(ctx: EvalContext, args: Args, file: string): Promise<SampleResult> {
  const id = file.replace(new RegExp(`\\${path.extname(file)}$`), '')
  const base = path.join(ctx.fixturesDir, id)
  const samples = decodeAudio16kMono(path.join(ctx.fixturesDir, file))
  const audioSec = samples.length / SAMPLE_RATE

  let hyp: string
  let procMs: number
  let segCount: number | undefined
  let hypCount: number | undefined
  if (args.passA) {
    const vad = createEvalVad(ctx.sherpa, ctx.sileroPath!)
    const r = await runPassA(ctx.rec, vad, samples, args.realtime)
    hyp = r.text
    procMs = r.computeMs
    segCount = r.segCount
    hypCount = r.hypCount
  } else {
    const t0 = performance.now()
    const segments = recognizeSamples(ctx.rec, samples, () => {})
    procMs = performance.now() - t0
    hyp = segments.map((s) => s.text).join('')
  }
  // 本进程只跑这一个 fixture → RSS = 该样本干净工作集(无跨文件 OfflineStream 泄漏累积)
  const rssMb = process.memoryUsage().rss / 1024 / 1024

  if (args.dumpHyp) fs.writeFileSync(`${base}.hyp.txt`, hyp)
  const ref = loadReference(base)
  const hasRef = ref !== null
  const refN = normalize(ref ?? '', args.stripPunct, args.normNum, args.stripFillers)
  const hypN = normalize(hyp, args.stripPunct, args.normNum, args.stripFillers)
  const cer = hasRef && refN.length > 0 ? editDistance(refN, hypN) / refN.length : NaN

  const terms = loadExpectedTerms(`${base}.terms.json`)
  // 命中判定去空格 + 小写:模型常把英文缩写识别成「c p o」带空格,不该算漏(CER 侧也去空格)
  const hypNorm = hyp.replace(/\s+/g, '').toLowerCase()
  const termsHit = terms.filter((t) => hypNorm.includes(t.replace(/\s+/g, '').toLowerCase())).length
  const termHitRate = terms.length > 0 ? termsHit / terms.length : null

  return {
    id,
    audioSec,
    procMs,
    rtf: procMs / 1000 / audioSec,
    cer,
    refChars: refN.length,
    termHitRate,
    termsTotal: terms.length,
    termsHit,
    segCount,
    hypCount,
    rssMb,
  }
}

function printSampleLine(args: Args, r: SampleResult): void {
  const cerStr = Number.isNaN(r.cer) ? '  (无 ref) ' : fmtPct(r.cer).padStart(7)
  const termStr = r.termHitRate === null ? '  (无 terms)' : `${r.termsHit}/${r.termsTotal}`
  const paStr = args.passA ? `  段 ${r.segCount} hyp ${r.hypCount}` : `  术语 ${termStr}`
  console.info(
    `${r.id.padEnd(16)} ${r.audioSec.toFixed(1).padStart(6)}s  ` +
      `RTF ${r.rtf.toFixed(3)}  CER ${cerStr}${paStr}  RSS ${(r.rssMb ?? 0).toFixed(0)}MB`,
  )
}

const RESULT_SENTINEL = '__EVAL_RESULT__'

/** 子进程模式:跑单个 fixture,把 SampleResult 作为 sentinel 行写 stdout(供父进程解析) */
async function runChild(args: Args): Promise<void> {
  const ctx = loadContext(args)
  const result = await processFixture(ctx, args, args.only!)
  process.stdout.write(`${RESULT_SENTINEL}${JSON.stringify(result)}\n`)
}

/** 在干净子进程里跑一个 fixture,隔离 sherpa OfflineStream 跨文件泄漏 → 拿真实 per-sample RTF/RSS */
function runFixtureInChild(args: Args, file: string): SampleResult {
  const scriptPath = process.argv[1]! // 本脚本路径(tsx / node --import tsx 下均为 argv[1])
  const stdout = execFileSync(
    process.execPath,
    ['--import', 'tsx', scriptPath, '--only', file, ...childFlags(args)],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: process.env },
  )
  const line = stdout.split(/\r?\n/).find((l) => l.startsWith(RESULT_SENTINEL))
  if (!line) throw new Error(`子进程未返回结果(${file}):\n${stdout}`)
  return JSON.parse(line.slice(RESULT_SENTINEL.length)) as SampleResult
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  // 子进程:只跑 --only 指定的那个 fixture,输出结果后退出
  if (args.only) {
    await runChild(args)
    return
  }

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

  // 父进程只编排:每个 fixture 起独立子进程(sherpa OfflineStream 无 free,跨文件复用同进程会累积泄漏,
  // 污染 RTF/RSS;见 tech-feasibility「OfflineStream 原生内存泄漏」)。模型按 fixture 重载,慢但量得准。
  const modelDir = resolveModelDir(args.modelDir)
  console.info(`模型:${modelDir}`)
  console.info(
    `模式:${args.passA ? `Pass A 实时模拟${args.realtime ? '(1x 节奏)' : '(尽快喂)'}` : 'Pass B 离线'}(每 fixture 独立子进程)`,
  )
  console.info(`样本:${audioFiles.length} 段 @ ${fixturesDir}\n`)

  const results: SampleResult[] = []
  let rssPeakMb = 0
  for (const file of audioFiles) {
    const r = runFixtureInChild(args, file)
    results.push(r)
    if ((r.rssMb ?? 0) > rssPeakMb) rssPeakMb = r.rssMb ?? 0
    printSampleLine(args, r)
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
      mode: args.passA ? (args.realtime ? 'pass-a-realtime' : 'pass-a') : 'pass-b',
      modelDir,
      fixturesDir,
      stripPunct: args.stripPunct,
      normNum: args.normNum,
      stripFillers: args.stripFillers,
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

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
