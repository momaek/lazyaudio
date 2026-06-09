// T61 评测基建 — Pass A(实时)latency / RTF 埋点(dev-plan §6.2.6)。
//
// 默认 no-op,零开销零协议改动。设环境变量 LAZY_PASSA_METRICS 才记录:
//   LAZY_PASSA_METRICS=1            → 写 cwd/passa-metrics.jsonl
//   LAZY_PASSA_METRICS=/path.jsonl  → 写指定文件
// utility 进程默认继承主进程 env(utilityProcess.fork),所以启动 app 时设一次即可。
//
// 记录的事件(JSONL,每行一个对象):
//   segment-start  新语音段开始(VAD 首次判定有人声)
//   recog          一次识别的墙钟耗时 + RTF(hypothesis 重识别 / confirmed 固化)
//   first-token    段内第一个 hypothesis 出来时,距段开始的延迟(首字延迟)
//   commit         段固化(reason: silence / max-window / flush),距段开始的总墙钟
//
// 缓冲在内存,flush() 时一次性落盘(避免 fs 同步写扰动被测的识别耗时)。

import fs from 'node:fs'

export interface PassAMetrics {
  /** VAD 首次判定有人声、开新段 */
  segmentStarted(segmentId: string): void
  /** 一次识别完成:audioMs=喂入音频时长,wallMs=识别墙钟耗时 */
  recognized(stability: 'hypothesis' | 'confirmed', audioMs: number, wallMs: number): void
  /** 段固化 */
  committed(segmentId: string, reason: 'silence' | 'max-window' | 'flush'): void
  /** 录音 stop:落盘 */
  flush(): void
}

export const noopPassAMetrics: PassAMetrics = {
  segmentStarted() {},
  recognized() {},
  committed() {},
  flush() {},
}

type Line = Record<string, unknown> & { t: number; kind: string }

class JsonlPassAMetrics implements PassAMetrics {
  private lines: Line[] = []
  private segId: string | null = null
  private segStartWall = 0
  private sawFirstHyp = false

  constructor(private readonly filePath: string) {}

  private push(kind: string, extra: Record<string, unknown>): void {
    this.lines.push({ t: Date.now(), kind, ...extra })
  }

  segmentStarted(segmentId: string): void {
    this.segId = segmentId
    this.segStartWall = Date.now()
    this.sawFirstHyp = false
    this.push('segment-start', { segmentId })
  }

  recognized(stability: 'hypothesis' | 'confirmed', audioMs: number, wallMs: number): void {
    this.push('recog', {
      segmentId: this.segId,
      stability,
      audioMs: Math.round(audioMs),
      wallMs: Math.round(wallMs),
      rtf: audioMs > 0 ? +(wallMs / audioMs).toFixed(4) : null,
    })
    if (stability === 'hypothesis' && !this.sawFirstHyp && this.segId != null) {
      this.sawFirstHyp = true
      this.push('first-token', {
        segmentId: this.segId,
        latencyMs: Date.now() - this.segStartWall,
      })
    }
  }

  committed(segmentId: string, reason: 'silence' | 'max-window' | 'flush'): void {
    this.push('commit', {
      segmentId,
      reason,
      segWallMs: this.segStartWall > 0 ? Date.now() - this.segStartWall : null,
    })
  }

  flush(): void {
    if (this.lines.length === 0) return
    try {
      fs.appendFileSync(this.filePath, this.lines.map((l) => JSON.stringify(l)).join('\n') + '\n')
    } catch {
      // 评测埋点失败不能影响录音 / 转录;静默吞掉
    }
    this.lines = []
  }
}

/** 按 env 决定启用与否;未设则返回 no-op 单例 */
export function createPassAMetrics(): PassAMetrics {
  const flag = process.env['LAZY_PASSA_METRICS']
  if (!flag) return noopPassAMetrics
  const filePath = flag === '1' ? 'passa-metrics.jsonl' : flag
  return new JsonlPassAMetrics(filePath)
}
