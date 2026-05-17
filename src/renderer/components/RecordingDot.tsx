// design-system §5.2 — 呼吸红点
// 录音中的核心视觉锚点。breathe 动画在 globals.css 定义。
type Props = {
  size?: number // px,列表项中 8 / 菜单栏中 10
  paused?: boolean // 暂停态:动画停 + 颜色降为 gray-400
  className?: string
}

export function RecordingDot({
  size = 8,
  paused = false,
  className = '',
}: Props): React.JSX.Element {
  return (
    <span
      className={`inline-block rounded-full ${paused ? 'bg-gray-400' : 'bg-record'} ${className}`}
      style={{
        width: size,
        height: size,
        animation: paused ? 'none' : 'breathe 1.2s ease-in-out infinite',
      }}
      aria-label={paused ? 'recording paused' : 'recording'}
    />
  )
}
