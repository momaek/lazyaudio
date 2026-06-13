// SPIKE(T61)— 流式 zh-zipformer transducer + 热词 vs SenseVoice。
//
// 背景:SenseVoice(CTC,贪心解码)原理上不支持热词(只有 transducer + modified_beam_search 支持)。
// 本 spike 评估:换 sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30(transducer)能否在 dogfood
// 上打平 SenseVoice,且热词能否救专有名词。CER 口径复用 eval-lib(= 校准基线,A/B 公平)。
//
// 注意:该模型是 multi-zh-hans 纯中文(tokens 无英文词表),英文名只能 byte-fallback;热词也只能上中文。
//
// 用法:
//   pnpm tsx scripts/spike-online-zh-hotwords.ts                 # greedy,无热词
//   pnpm tsx scripts/spike-online-zh-hotwords.ts --beam          # modified_beam_search,无热词
//   pnpm tsx scripts/spike-online-zh-hotwords.ts --hotwords scripts/spike-hotwords.txt  # beam + 热词
//   附加:[fixturesDir] --model <dir> --dump-hyp --json out.json --keep-fillers --no-norm-num

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'
import {
  SAMPLE_RATE,
  AUDIO_EXTS,
  resolveSherpaPlatformDir,
  decodeAudio16kMono,
  loadReference,
  computeCer,
  fmtPct,
  type NormOpts,
} from './eval-lib'

const DEFAULT_MODEL = 'sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30'

interface OnlineStream {
  acceptWaveform(o: { samples: Float32Array; sampleRate: number }): void
  inputFinished(): void
}
interface OnlineRecognizer {
  createStream(): OnlineStream
  isReady(s: OnlineStream): boolean
  decode(s: OnlineStream): void
  getResult(s: OnlineStream): { text?: string }
}
interface OnlineSherpa {
  OnlineRecognizer: new (config: unknown) => OnlineRecognizer
}

interface Args {
  fixturesDir: string
  modelDir: string | null
  hotwordsFile: string | null
  beam: boolean
  dumpHyp: boolean
  jsonOut: string | null
  norm: NormOpts
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    fixturesDir: 'fixtures/transcribe',
    modelDir: null,
    hotwordsFile: null,
    beam: false,
    dumpHyp: false,
    jsonOut: null,
    norm: { stripPunct: false, normNum: true, stripFillers: true },
  }
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i]
    if (x === '--model') a.modelDir = argv[++i] ?? null
    else if (x === '--hotwords') {
      a.hotwordsFile = argv[++i] ?? null
      a.beam = true // 热词必须 modified_beam_search
    } else if (x === '--beam') a.beam = true
    else if (x === '--dump-hyp') a.dumpHyp = true
    else if (x === '--json') a.jsonOut = argv[++i] ?? null
    else if (x === '--strip-punct') a.norm.stripPunct = true
    else if (x === '--no-norm-num') a.norm.normNum = false
    else if (x === '--keep-fillers') a.norm.stripFillers = false
    else if (x && !x.startsWith('--')) a.fixturesDir = x
  }
  return a
}

function resolveModelDir(explicit: string | null): string {
  const cands = [
    explicit,
    process.env['LAZY_ZH_MODEL_DIR'],
    path.resolve('.local-userdata', 'models', DEFAULT_MODEL),
    path.join(os.homedir(), 'Library', 'Application Support', 'LazyAudio', 'models', DEFAULT_MODEL),
  ].filter((c): c is string => !!c)
  for (const d of cands) {
    if (fs.existsSync(path.join(d, 'encoder.int8.onnx'))) return d
  }
  throw new Error(`找不到 zh-zipformer 模型(encoder.int8.onnx)。试过:\n  ${cands.join('\n  ')}`)
}

function buildRecognizer(sherpa: OnlineSherpa, dir: string, args: Args): OnlineRecognizer {
  return new sherpa.OnlineRecognizer({
    modelConfig: {
      transducer: {
        encoder: path.join(dir, 'encoder.int8.onnx'),
        decoder: path.join(dir, 'decoder.onnx'),
        joiner: path.join(dir, 'joiner.int8.onnx'),
      },
      tokens: path.join(dir, 'tokens.txt'),
      numThreads: 2,
      provider: 'cpu',
      debug: 0,
    },
    decodingMethod: args.beam ? 'modified_beam_search' : 'greedy_search',
    maxActivePaths: 4,
    enableEndpoint: false, // 整段当一条流解,不做 endpoint 切分
    hotwordsFile: args.hotwordsFile ?? '',
    hotwordsScore: 2.0,
  })
}

/** 整段音频喂流式识别器:分块 accept + 边解码,inputFinished 后排空。返回全文。 */
function transcribeOnline(rec: OnlineRecognizer, samples: Float32Array): string {
  const stream = rec.createStream()
  const CHUNK = SAMPLE_RATE * 10 // 10s 块,边喂边解,控内存
  for (let p = 0; p < samples.length; p += CHUNK) {
    stream.acceptWaveform({
      samples: new Float32Array(samples.subarray(p, p + CHUNK)),
      sampleRate: SAMPLE_RATE,
    })
    while (rec.isReady(stream)) rec.decode(stream)
  }
  stream.inputFinished()
  while (rec.isReady(stream)) rec.decode(stream)
  return (rec.getResult(stream).text ?? '').trim()
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const fixturesDir = path.resolve(args.fixturesDir)
  const files = fs
    .readdirSync(fixturesDir)
    .filter((f) => AUDIO_EXTS.includes(path.extname(f).toLowerCase()))
    .sort()
  if (files.length === 0) {
    console.error(`${fixturesDir} 无音频样本`)
    process.exit(1)
  }

  const modelDir = resolveModelDir(args.modelDir)
  const platformDir = resolveSherpaPlatformDir()
  process.env['SHERPA_ONNX_INSTALL_DIR'] = platformDir
  const requireCjs = createRequire(path.join(process.cwd(), 'package.json'))
  const sherpa = requireCjs('sherpa-onnx-node') as OnlineSherpa
  const rec = buildRecognizer(sherpa, modelDir, args)

  const decoding = args.beam ? 'modified_beam_search' : 'greedy_search'
  console.info(`模型:${modelDir}`)
  console.info(`解码:${decoding}${args.hotwordsFile ? ` + 热词(${args.hotwordsFile})` : ''}`)
  console.info(`样本:${files.length} 段 @ ${fixturesDir}\n`)

  const results: Array<{ id: string; audioSec: number; rtf: number; cer: number }> = []
  for (const file of files) {
    const id = file.replace(new RegExp(`\\${path.extname(file)}$`), '')
    const base = path.join(fixturesDir, id)
    const samples = decodeAudio16kMono(path.join(fixturesDir, file))
    const audioSec = samples.length / SAMPLE_RATE

    const t0 = performance.now()
    const hyp = transcribeOnline(rec, samples)
    const procMs = performance.now() - t0
    if (args.dumpHyp) fs.writeFileSync(`${base}.zh.hyp.txt`, hyp)

    const { cer } = computeCer(loadReference(base), hyp, args.norm)
    const rtf = procMs / 1000 / audioSec
    results.push({ id, audioSec, rtf, cer })
    const cerStr = Number.isNaN(cer) ? '(无ref)' : fmtPct(cer).padStart(7)
    console.info(
      `${id.padEnd(22)} ${audioSec.toFixed(1).padStart(6)}s  RTF ${rtf.toFixed(3)}  CER ${cerStr}`,
    )
  }

  const cerVals = results.map((r) => r.cer).filter((x) => !Number.isNaN(x))
  const mean = (xs: number[]): number =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN
  console.info('\n— 汇总 —')
  console.info(`平均 CER  ${fmtPct(mean(cerVals))}`)
  console.info(`平均 RTF  ${mean(results.map((r) => r.rtf)).toFixed(3)}`)

  if (args.jsonOut) {
    fs.writeFileSync(
      args.jsonOut,
      JSON.stringify({ decoding, hotwordsFile: args.hotwordsFile, modelDir, results }, null, 2),
    )
    console.info(`\n已写 ${args.jsonOut}`)
  }
}

main()
