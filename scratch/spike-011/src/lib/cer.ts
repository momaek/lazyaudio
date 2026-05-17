// 中文 CER (Character Error Rate)
// 标准做法:Levenshtein(ref chars, hyp chars) / len(ref chars)
// 归一化:去标点 / 去空白 / 统一大小写;中英混编时 English 也按字符计

const PUNCT_RE = /[\s,，.。!！?？:：;；'"`'""·…—-]+/g

export function normalize(s: string): string {
  return s.toLowerCase().replace(PUNCT_RE, '')
}

export function toChars(s: string): string[] {
  // 处理代理对(emoji 等),虽然 v0.1 不太可能命中
  return Array.from(normalize(s))
}

// 经典 Wagner-Fischer DP,空间 O(min(m,n))
export function editDistance(a: string[], b: string[]): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  // 让 a 更短以节约空间
  if (a.length > b.length) [a, b] = [b, a]
  const m = a.length
  const n = b.length
  let prev = new Array<number>(m + 1)
  let curr = new Array<number>(m + 1)
  for (let i = 0; i <= m; i++) prev[i] = i
  for (let j = 1; j <= n; j++) {
    curr[0] = j
    for (let i = 1; i <= m; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[i] = Math.min(
        (prev[i] ?? 0) + 1, // deletion
        (curr[i - 1] ?? 0) + 1, // insertion
        (prev[i - 1] ?? 0) + cost, // substitution
      )
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[m] ?? 0
}

export type CerResult = {
  refLen: number
  hypLen: number
  distance: number
  cer: number
}

export function computeCer(reference: string, hypothesis: string): CerResult {
  const ref = toChars(reference)
  const hyp = toChars(hypothesis)
  const distance = editDistance(ref, hyp)
  const cer = ref.length === 0 ? (hyp.length === 0 ? 0 : 1) : distance / ref.length
  return { refLen: ref.length, hypLen: hyp.length, distance, cer }
}
