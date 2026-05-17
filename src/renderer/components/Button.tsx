// design-system §5.7 — Button
// 变体:Primary / Secondary / Ghost / Destructive(Icon-only 待 T19 引入 icon 系统时补)
// 高度:32px 默认 / 28px 紧凑 / 40px onboarding
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive'
type Size = 'compact' | 'default' | 'onboarding'

type Props = {
  variant?: Variant
  size?: Size
  children: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:opacity-90',
  secondary:
    'bg-transparent border border-accent text-accent hover:bg-accent/10 dark:hover:bg-accent/20',
  ghost: 'bg-transparent text-gray-700 dark:text-gray-200 hover:bg-bg-l3',
  destructive: 'bg-danger text-white hover:opacity-90',
}

const SIZE_CLASS: Record<Size, string> = {
  compact: 'h-7 px-3 text-sm',
  default: 'h-8 px-4 text-sm',
  onboarding: 'h-10 px-5 text-base',
}

export function Button({
  variant = 'primary',
  size = 'default',
  className = '',
  children,
  ...rest
}: Props): React.JSX.Element {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
