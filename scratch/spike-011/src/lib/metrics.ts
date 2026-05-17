// 测量工具:延迟 / 内存 / hypothesis volatility

export function nowMs(): number {
  return performance.now()
}

export function memoryRssMB(): number {
  return process.memoryUsage().rss / 1024 / 1024
}

// hypothesis 轨迹:streaming 模式下每次 partial result 的快照
export type HypothesisSnapshot = {
  tMs: number // 自开始推流起的毫秒
  text: string
}

// 计算 hypothesis 轨迹里"text 被改写"的次数
// 改写 = 当前 text 不是上一次 text 的纯后缀扩展(也就是说前缀被动过)
export function computeVolatility(snaps: HypothesisSnapshot[]): {
  rewrites: number
  totalTransitions: number
  rewriteRate: number
  finalText: string
} {
  let rewrites = 0
  let transitions = 0
  for (let i = 1; i < snaps.length; i++) {
    const prev = snaps[i - 1]?.text ?? ''
    const curr = snaps[i]?.text ?? ''
    if (prev === curr) continue
    transitions++
    // 判定:curr 是否以 prev 为前缀(仅 append)? 若否,则前缀变了 → rewrite
    if (!curr.startsWith(prev)) rewrites++
  }
  return {
    rewrites,
    totalTransitions: transitions,
    rewriteRate: transitions === 0 ? 0 : rewrites / transitions,
    finalText: snaps[snaps.length - 1]?.text ?? '',
  }
}

// 延迟统计帮手:percentile
export function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx] ?? 0
}
