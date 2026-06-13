// T61 评测公共库 — 音频解码 / 参考稿解析 / CER 度量。
//
// eval-transcribe-fixtures.ts(SenseVoice Pass A/B)与各 spike 脚本共用,**保证 CER 口径完全一致**
// (度量实现只此一份,A/B 对比才公平)。纯函数 + Node 内置,无 electron 依赖;跑在 worker tsconfig 项目。

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { readWav16kMono } from '../src/main/workers/asr/recognize'

export const SAMPLE_RATE = 16000

// 输入音频扩展名(.wav 走内置 RIFF 解析;其余走 ffmpeg 解码)
export const AUDIO_EXTS = [
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

/** 平台子包目录(含 .node + 平台二进制),dev 下 node_modules 在源码树 */
export function resolveSherpaPlatformDir(): string {
  const platform = process.platform === 'win32' ? 'win' : process.platform
  return path.resolve('node_modules', `sherpa-onnx-${platform}-${process.arch}`)
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
export function decodeAudio16kMono(inputPath: string): Float32Array {
  if (inputPath.toLowerCase().endsWith('.wav')) return readWav16kMono(inputPath).samples
  return decodeViaFfmpeg(inputPath)
}

/** SRT → 纯文本:去序号行、时间轴行(含 -->)、空行,拼正文 */
export function parseSrt(srt: string): string {
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
export function loadReference(base: string): string | null {
  const txt = `${base}.ref.txt`
  if (fs.existsSync(txt)) return fs.readFileSync(txt, 'utf8')
  const srt = `${base}.srt`
  if (fs.existsSync(srt)) return parseSrt(fs.readFileSync(srt, 'utf8'))
  return null
}

/** terms.json → 期望命中的专有名词列表(数组直接用;对象取 value 侧) */
export function loadExpectedTerms(termsPath: string): string[] {
  if (!fs.existsSync(termsPath)) return []
  const raw = JSON.parse(fs.readFileSync(termsPath, 'utf8')) as unknown
  let terms: string[]
  if (Array.isArray(raw)) terms = raw.map(String)
  else if (raw && typeof raw === 'object') terms = Object.values(raw as Record<string, string>)
  else terms = []
  return [...new Set(terms.map((t) => t.trim()).filter(Boolean))]
}

// ── CER 度量 ──────────────────────────────────────────────────────────────

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

export interface NormOpts {
  stripPunct: boolean
  normNum: boolean
  stripFillers: boolean
}

/** 规范化:去空白 + ASCII 小写;normNum 时数字归一;stripFillers 时剥纯语气词;stripPunct 时去标点 */
export function normalize(text: string, opts: NormOpts): string {
  let s = text.replace(/\s+/g, '').toLowerCase()
  if (opts.normNum) s = normalizeNumbers(s)
  if (opts.stripFillers) {
    // 纯语气词对称剥除:视频字幕普遍删「嗯/啊/呃」,模型听到写出来不该算插入错
    // (dogfood 实测:roundtable 类 hyp 比字幕多 ~140 处语气词 ≈ 2.2-2.5% 假 CER)。
    // 只剥单字语气词,「就是/然后/那个」是真词不动。
    s = s.replace(/[嗯呃哦诶唉啊呀嘛]/g, '')
  }
  if (opts.stripPunct) {
    // 中英常见标点(不动汉字 / 字母 / 数字)
    s = s.replace(/[.,!?;:'"`~@#$%^&*()_+\-=[\]{}\\|/<>。,、!?;:""''（）【】《》—…·]/g, '')
  }
  return s
}

/** 字符级 Levenshtein 编辑距离(两行 DP) */
export function editDistance(a: string, b: string): number {
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

/** 算 CER:规范化两边后字符级编辑距离 / 参考长度。ref 为空返回 cer=NaN。 */
export function computeCer(
  ref: string | null,
  hyp: string,
  opts: NormOpts,
): { cer: number; refChars: number } {
  const refN = normalize(ref ?? '', opts)
  const hypN = normalize(hyp, opts)
  const cer = ref !== null && refN.length > 0 ? editDistance(refN, hypN) / refN.length : NaN
  return { cer, refChars: refN.length }
}

export function fmtPct(x: number): string {
  return (x * 100).toFixed(1) + '%'
}
