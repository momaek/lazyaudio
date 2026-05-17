// Waveform.jsx — a static SVG waveform with deterministic-looking variance.
// Plays nicely at 64px tall × any width. Played portion fills accent.
// Width is fluid via 100%; bars rendered at fixed pitch for crispness.

function Waveform({
  progress = 0.17,
  bars = 220,
  color = 'var(--accent)',
  track = 'var(--gray-300)',
  height = 48,
}) {
  // PRNG-ish but seeded — same sequence every render so the look is stable.
  const arr = React.useMemo(() => {
    const out = []
    let seed = 9301
    for (let i = 0; i < bars; i++) {
      seed = (seed * 9301 + 49297) % 233280
      const r = seed / 233280
      // shape envelope: louder in middle clusters, quieter at edges
      const env = 0.35 + 0.65 * Math.pow(Math.sin((i / bars) * Math.PI), 0.5)
      // local variation
      const local = 0.25 + 0.75 * Math.pow(r, 1.4)
      // pockets of quiet (pauses between turns)
      const pocket = i % 47 < 4 || i % 73 < 3 ? 0.25 : 1
      out.push(Math.max(0.06, env * local * pocket))
    }
    return out
  }, [bars])

  const playedCount = Math.floor(arr.length * progress)
  return (
    <svg className="wf-canvas" viewBox={`0 0 ${bars * 4} ${height}`} preserveAspectRatio="none">
      {arr.map((v, i) => {
        const h = Math.max(1, v * (height - 4))
        const y = (height - h) / 2
        return (
          <rect
            key={i}
            x={i * 4 + 1}
            y={y}
            width={2}
            height={h}
            rx={1}
            fill={i < playedCount ? color : track}
          />
        )
      })}
    </svg>
  )
}

window.Waveform = Waveform
