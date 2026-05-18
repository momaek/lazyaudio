import { useEffect, useRef, useState } from 'react'
import { frames, TICK_MS, type Segment } from './asr-mock'

// 简单字符串 hash(djb2),不依赖 crypto。
function hashStr(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i)
  return (h >>> 0).toString(36)
}

type Stats = { mounts: number; unmounts: number; renders: number }

function useStatsRef() {
  return useRef<Stats>({ mounts: 0, unmounts: 0, renders: 0 })
}

function SegmentItem({ seg, stats }: { seg: Segment; stats: React.RefObject<Stats> }) {
  // 每次渲染都计数(为了对比 mount/render 比例)
  stats.current!.renders += 1
  useEffect(() => {
    stats.current!.mounts += 1
    return () => {
      stats.current!.unmounts += 1
    }
  }, [])
  return (
    <div
      style={{
        padding: '6px 10px',
        borderRadius: 6,
        background: '#fff',
        marginBottom: 4,
        color: seg.stability === 'hypothesis' ? '#888' : '#111',
        fontStyle: seg.stability === 'hypothesis' ? 'italic' : 'normal',
        border: '1px solid #eee',
      }}
    >
      <span
        style={{
          fontFamily: 'ui-monospace, monospace',
          fontSize: 11,
          color: '#aaa',
          marginRight: 8,
        }}
      >
        {`${(seg.startMs / 1000).toFixed(1)}s`}
      </span>
      {seg.text}
      {seg.stability === 'confirmed' && <span style={{ color: '#4a8', marginLeft: 8 }}>✓</span>}
    </div>
  )
}

function Panel({
  title,
  hint,
  segments,
  keyFn,
  stats,
}: {
  title: string
  hint: string
  segments: Segment[]
  keyFn: (s: Segment) => string
  stats: React.RefObject<Stats>
}) {
  return (
    <div
      style={{
        flex: 1,
        border: '1px solid #ddd',
        borderRadius: 8,
        padding: 12,
        background: '#fafafa',
      }}
    >
      <h3 style={{ margin: '0 0 4px', fontSize: 14 }}>{title}</h3>
      <p style={{ margin: '0 0 10px', color: '#666', fontSize: 12 }}>{hint}</p>
      <div
        style={{
          fontFamily: 'ui-monospace, monospace',
          fontSize: 11,
          color: '#888',
          marginBottom: 8,
        }}
      >
        渲染: {stats.current!.renders} / mount: {stats.current!.mounts} / unmount:{' '}
        {stats.current!.unmounts}
      </div>
      {segments.map((s) => (
        <SegmentItem key={keyFn(s)} seg={s} stats={stats} />
      ))}
    </div>
  )
}

export function App() {
  const [tick, setTick] = useState(0)
  const [running, setRunning] = useState(true)
  const statsHash = useStatsRef()
  const statsStable = useStatsRef()
  const segments = frames[Math.min(tick, frames.length - 1)]

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setTick((t) => {
        if (t >= frames.length - 1) {
          setRunning(false)
          return t
        }
        return t + 1
      })
    }, TICK_MS)
    return () => clearInterval(id)
  }, [running])

  const reset = () => {
    statsHash.current = { mounts: 0, unmounts: 0, renders: 0 }
    statsStable.current = { mounts: 0, unmounts: 0, renders: 0 }
    setTick(0)
    setRunning(true)
  }

  // 同分母:总 segment-update 数(每 tick 的 segment 总和)
  const totalUpdates = frames.slice(0, tick + 1).reduce((acc, f) => acc + f.length, 0)
  // 每个 segment 期望只 mount 一次,稳定率 = 1 - (unmounts / segment 总数)
  // 但 React 19 StrictMode dev 会 mount/unmount 一次。我们关闭 StrictMode 验真实数字。
  const segmentsSeenStable = new Set<string>()
  const segmentsSeenHash = new Set<string>()
  for (let i = 0; i <= tick; i++) {
    for (const s of frames[i]) {
      segmentsSeenStable.add(`${s.startMs}`)
      segmentsSeenHash.add(hashStr(s.text))
    }
  }

  return (
    <div
      style={{
        fontFamily: '-apple-system, system-ui, sans-serif',
        padding: 20,
        maxWidth: 1100,
        margin: '0 auto',
      }}
    >
      <h1 style={{ fontSize: 18, margin: '0 0 4px' }}>spike-013 — segment key 稳定性对比</h1>
      <p style={{ margin: '0 0 12px', color: '#555', fontSize: 13 }}>
        同一 ASR mock 数据流并排喂两个策略。React key 不稳定会导致 segment unmount → DOM 闪烁 +
        阅读光标跳行。tick {tick + 1} / {frames.length}
      </p>
      <div style={{ marginBottom: 12 }}>
        <button
          onClick={reset}
          style={{ padding: '6px 14px', cursor: 'pointer', marginRight: 8 }}
          disabled={running}
        >
          重新跑
        </button>
        <span style={{ fontSize: 12, color: '#888' }}>
          唯一 segment 数(timestamp): {segmentsSeenStable.size} | 唯一 hash: {segmentsSeenHash.size}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <Panel
          title="A. content-hash key"
          hint="key = hash(seg.text):文本一改 key 变 → 整段 unmount+remount"
          segments={segments}
          keyFn={(s) => hashStr(s.text)}
          stats={statsHash}
        />
        <Panel
          title="B. timestamp-start key"
          hint="key = seg.startMs:VAD 切窗给的起点,稳定;文本改写不影响 key"
          segments={segments}
          keyFn={(s) => `seg-${s.startMs}`}
          stats={statsStable}
        />
      </div>
      <div
        style={{
          marginTop: 16,
          padding: 12,
          background: '#f5f5f5',
          borderRadius: 6,
          fontFamily: 'ui-monospace, monospace',
          fontSize: 12,
        }}
      >
        <div>总 segment-update(分母): {totalUpdates}</div>
        <div>A unmount 次数: {statsHash.current!.unmounts}</div>
        <div>B unmount 次数: {statsStable.current!.unmounts}</div>
        <div>
          B segment id 稳定率 = 1 - (unmount × StrictMode 修正 / 期望持续段数):{' '}
          <b>
            {((1 - statsStable.current!.unmounts / Math.max(1, totalUpdates)) * 100).toFixed(1)}%
          </b>
        </div>
        <div style={{ marginTop: 6, color: '#888' }}>
          注:此 POC 关掉 React StrictMode(main.tsx)即测真实 mount/unmount;开 StrictMode 时 dev 每个
          mount 会 double 一次。
        </div>
      </div>
    </div>
  )
}
