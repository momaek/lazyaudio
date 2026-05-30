// T31 — 源选择策略(transcription-pipeline.md §5.3)。
//
// registry.sources 顺序 = 国内默认(hf-mirror 先);海外(locale 非 zh)把 huggingface 提前。
// 首次下载可并发 HEAD 测速,按响应快的优先;探测失败 / 超时不阻塞,退回默认顺序。
// 本模块不 import electron(纯函数 + fetch),便于单测;locale 由调用方传入。

const HF_MIRROR_MARK = 'hf-mirror'

/** 默认顺序:zh locale 保持 registry 原序(国内镜像先);否则把非 hf-mirror 源提前 */
export function orderSources(sources: string[], locale: string): string[] {
  const isCn = locale.toLowerCase().startsWith('zh')
  if (isCn) return [...sources]
  // 海外:把 hf-mirror 排到最后,其余保持相对顺序
  const overseas = sources.filter((s) => !s.includes(HF_MIRROR_MARK))
  const mirrors = sources.filter((s) => s.includes(HF_MIRROR_MARK))
  return [...overseas, ...mirrors]
}

/**
 * 并发 HEAD 测速,按延迟升序重排;全部失败返回 null(调用方退回默认顺序)。
 * probeUrl 把 source 模板解析成可 HEAD 的真实 URL(替换 {file})。
 */
export async function probeFastest(
  sources: string[],
  probeUrl: (source: string) => string,
  timeoutMs = 5000,
): Promise<string[] | null> {
  const results = await Promise.all(
    sources.map(async (source) => {
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), timeoutMs)
      const t0 = Date.now()
      try {
        const res = await fetch(probeUrl(source), {
          method: 'HEAD',
          redirect: 'follow',
          signal: ac.signal,
        })
        // HF resolve 对 LFS 文件可能 HEAD 返 200(已跟随到 cas);非 2xx 视为不可用
        if (!res.ok) return { source, latency: Number.POSITIVE_INFINITY }
        return { source, latency: Date.now() - t0 }
      } catch {
        return { source, latency: Number.POSITIVE_INFINITY }
      } finally {
        clearTimeout(timer)
      }
    }),
  )

  const reachable = results.filter((r) => Number.isFinite(r.latency))
  if (reachable.length === 0) return null
  reachable.sort((a, b) => a.latency - b.latency)
  // 可达的按延迟排前,不可达的(若有)仍保留在后面作兜底
  const unreachable = results.filter((r) => !Number.isFinite(r.latency)).map((r) => r.source)
  return [...reachable.map((r) => r.source), ...unreachable]
}
