// T03 design tokens showcase(dev-only entry)
// 把 design-system §2-4 token 全铺一遍 + 3 个示例组件 + 浅/深切换。
// AC:OS 模拟 / 手动 toggle 切深色,所有 token 视觉无回退。
import { useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { RecordingDot } from '../../components/RecordingDot'
import { TypeBadge, type SessionType } from '../../components/TypeBadge'

type Mode = 'auto' | 'light' | 'dark'

function applyMode(mode: Mode): void {
  const root = document.documentElement
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const isDark = mode === 'dark' || (mode === 'auto' && prefersDark)
  root.classList.toggle('dark', isDark)
}

export function App(): React.JSX.Element {
  const [mode, setMode] = useState<Mode>('auto')

  useEffect(() => {
    applyMode(mode)
    if (mode !== 'auto') return
    // 跟随系统模式时监听 OS 切换
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (): void => applyMode('auto')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode])

  return (
    <main className="min-h-screen bg-bg-l1 text-gray-900 dark:text-gray-50">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg-l0 px-6 py-3">
        <h1 className="text-xl font-semibold">LazyAudio · Design Tokens Showcase</h1>
        <div className="flex gap-2">
          {(['auto', 'light', 'dark'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`h-8 rounded-md px-3 text-sm font-medium transition-colors ${
                mode === m
                  ? 'bg-accent text-white'
                  : 'border border-border bg-bg-l2 text-gray-700 hover:bg-bg-l3 dark:text-gray-200'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </header>

      <div className="space-y-12 px-6 py-8">
        <ColorsSection />
        <TypographySection />
        <SpacingRadiusSection />
        <ShadowSection />
        <ComponentsSection />
      </div>
    </main>
  )
}

// ---- §2 颜色 -----------------------------------------------------------------
function ColorsSection(): React.JSX.Element {
  const grays = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const
  const grayClass: Record<(typeof grays)[number], string> = {
    50: 'bg-gray-50',
    100: 'bg-gray-100',
    200: 'bg-gray-200',
    300: 'bg-gray-300',
    400: 'bg-gray-400',
    500: 'bg-gray-500',
    600: 'bg-gray-600',
    700: 'bg-gray-700',
    800: 'bg-gray-800',
    900: 'bg-gray-900',
    950: 'bg-gray-950',
  }
  const brand = [
    { key: 'accent', cls: 'bg-accent' },
    { key: 'record', cls: 'bg-record' },
    { key: 'success', cls: 'bg-success' },
    { key: 'warning', cls: 'bg-warning' },
    { key: 'danger', cls: 'bg-danger' },
    { key: 'pending', cls: 'bg-pending' },
  ]
  const types: SessionType[] = [
    'general',
    'meeting',
    'note',
    'interview-as-interviewer',
    'interview-as-candidate',
    'lecture',
    'podcast',
  ]
  const bgLevels = [
    { key: 'L0 chrome', cls: 'bg-bg-l0' },
    { key: 'L1 surface', cls: 'bg-bg-l1' },
    { key: 'L2 raised', cls: 'bg-bg-l2' },
    { key: 'L3 hover', cls: 'bg-bg-l3' },
    { key: 'border', cls: 'bg-border' },
  ]

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold">§2 颜色</h2>

      <h3 className="mt-4 mb-2 text-sm text-gray-500 dark:text-gray-400">2.1 gray 11 阶</h3>
      <div className="grid grid-cols-11 gap-2">
        {grays.map((n) => (
          <div key={n} className="text-center">
            <div className={`h-12 rounded-md border border-border ${grayClass[n]}`} />
            <p className="mt-1 font-mono text-xs">{n}</p>
          </div>
        ))}
      </div>

      <h3 className="mt-6 mb-2 text-sm text-gray-500 dark:text-gray-400">2.2 brand + status</h3>
      <div className="grid grid-cols-6 gap-2">
        {brand.map((b) => (
          <div key={b.key} className="text-center">
            <div className={`h-12 rounded-md ${b.cls}`} />
            <p className="mt-1 font-mono text-xs">{b.key}</p>
          </div>
        ))}
      </div>

      <h3 className="mt-6 mb-2 text-sm text-gray-500 dark:text-gray-400">
        2.3 sessionType(深色变体自动切换)
      </h3>
      <div className="flex flex-wrap gap-2">
        {types.map((t) => (
          <TypeBadge key={t} type={t} />
        ))}
      </div>

      <h3 className="mt-6 mb-2 text-sm text-gray-500 dark:text-gray-400">2.4 背景层级</h3>
      <div className="grid grid-cols-5 gap-2">
        {bgLevels.map((b) => (
          <div key={b.key} className="text-center">
            <div className={`h-12 rounded-md border border-border ${b.cls}`} />
            <p className="mt-1 font-mono text-xs">{b.key}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

// ---- §3 字体 -----------------------------------------------------------------
function TypographySection(): React.JSX.Element {
  const sizes = [
    { key: 'text-xs', cls: 'text-xs', sample: '11/16 时间戳' },
    { key: 'text-sm', cls: 'text-sm', sample: '13/20 列表副信息' },
    { key: 'text-base', cls: 'text-base', sample: '14/22 主体文本' },
    { key: 'text-lg', cls: 'text-lg', sample: '16/24 列表标题' },
    { key: 'text-xl', cls: 'text-xl', sample: '18/26 详情头标题' },
    { key: 'text-2xl', cls: 'text-2xl', sample: '22/30 onboarding 标题' },
  ]
  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold">§3 字体</h2>
      <div className="space-y-2">
        {sizes.map((s) => (
          <div key={s.key} className="flex items-baseline gap-4">
            <code className="w-24 font-mono text-xs text-gray-500">{s.key}</code>
            <span className={s.cls}>{s.sample}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-1">
        <p className="text-sm">
          UI 字体栈:<span className="font-sans">系统中文 + sans-serif</span>
        </p>
        <p className="text-sm">
          转录 monospace:<span className="font-mono">[01:23:45] 测试 mono ABC123</span>
        </p>
      </div>
    </section>
  )
}

// ---- §4.1 / §4.2 spacing + radius -------------------------------------------
function SpacingRadiusSection(): React.JSX.Element {
  const spacing = [1, 2, 3, 4, 5, 6, 8, 10, 12]
  const radius = [
    { key: 'sm', cls: 'rounded-sm' },
    { key: 'md', cls: 'rounded-md' },
    { key: 'lg', cls: 'rounded-lg' },
    { key: 'xl', cls: 'rounded-xl' },
    { key: 'full', cls: 'rounded-full' },
  ]
  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold">§4 间距 / 圆角</h2>

      <h3 className="mt-2 mb-2 text-sm text-gray-500 dark:text-gray-400">
        4.1 spacing(Tailwind 4 默认 4px 基)
      </h3>
      <div className="flex items-end gap-3">
        {spacing.map((n) => (
          <div key={n} className="text-center">
            <div className="bg-accent" style={{ width: 16, height: n * 4 }} />
            <p className="mt-1 font-mono text-xs">s-{n}</p>
          </div>
        ))}
      </div>

      <h3 className="mt-6 mb-2 text-sm text-gray-500 dark:text-gray-400">4.2 圆角</h3>
      <div className="flex gap-3">
        {radius.map((r) => (
          <div key={r.key} className="text-center">
            <div className={`h-12 w-12 bg-accent ${r.cls}`} />
            <p className="mt-1 font-mono text-xs">{r.key}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

// ---- §4.3 阴影 ---------------------------------------------------------------
// Tailwind 4 JIT 只扫静态 class 字面量,shadow-${var} 拼接抓不到。enumerate 写死。
function ShadowSection(): React.JSX.Element {
  const shadows = [
    { key: 'sm', cls: 'shadow-sm' },
    { key: 'md', cls: 'shadow-md' },
    { key: 'lg', cls: 'shadow-lg' },
  ] as const
  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold">§4.3 阴影</h2>
      <div className="grid grid-cols-3 gap-4">
        {shadows.map((s) => (
          <div key={s.key} className="text-center">
            <div
              className={`mx-auto h-20 w-32 rounded-lg border border-border bg-bg-l1 ${s.cls}`}
            />
            <p className="mt-2 font-mono text-xs">shadow-{s.key}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

// ---- §5 核心组件 -------------------------------------------------------------
function ComponentsSection(): React.JSX.Element {
  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold">§5 组件示例</h2>

      <h3 className="mt-2 mb-2 text-sm text-gray-500 dark:text-gray-400">
        5.7 Button 4 变体 × 3 尺寸
      </h3>
      <div className="space-y-3">
        {(['compact', 'default', 'onboarding'] as const).map((size) => (
          <div key={size} className="flex items-center gap-3">
            <code className="w-24 font-mono text-xs text-gray-500">{size}</code>
            <Button variant="primary" size={size}>
              开始录音
            </Button>
            <Button variant="secondary" size={size}>
              取消
            </Button>
            <Button variant="ghost" size={size}>
              更多
            </Button>
            <Button variant="destructive" size={size}>
              删除
            </Button>
            <Button variant="primary" size={size} disabled>
              禁用
            </Button>
          </div>
        ))}
      </div>

      <h3 className="mt-6 mb-2 text-sm text-gray-500 dark:text-gray-400">5.2 RecordingDot</h3>
      <div className="flex items-center gap-4">
        <div className="inline-flex items-center gap-2">
          <RecordingDot size={8} />
          <span className="text-sm">8px(列表项)</span>
        </div>
        <div className="inline-flex items-center gap-2">
          <RecordingDot size={10} />
          <span className="text-sm">10px(菜单栏)</span>
        </div>
        <div className="inline-flex items-center gap-2">
          <RecordingDot size={8} paused />
          <span className="text-sm">paused</span>
        </div>
      </div>

      <h3 className="mt-6 mb-2 text-sm text-gray-500 dark:text-gray-400">
        5.1 TypeBadge 标准 + 紧凑
      </h3>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {(
            [
              'general',
              'meeting',
              'note',
              'interview-as-interviewer',
              'interview-as-candidate',
              'lecture',
              'podcast',
            ] as SessionType[]
          ).map((t) => (
            <TypeBadge key={t} type={t} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              'general',
              'meeting',
              'note',
              'interview-as-interviewer',
              'interview-as-candidate',
              'lecture',
              'podcast',
            ] as SessionType[]
          ).map((t) => (
            <TypeBadge key={t} type={t} density="compact" />
          ))}
        </div>
      </div>
    </section>
  )
}
