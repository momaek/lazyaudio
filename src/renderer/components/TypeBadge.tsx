// design-system §5.1 — 类型徽章
// 视觉:圆角 4px + label,背景类型色 @ 10% 透明度,文字类型色。
// 紧凑(仅圆点)/ 标准(圆点 + label)两个密度。
import type { ReactNode } from 'react'

export type SessionType =
  | 'general'
  | 'meeting'
  | 'note'
  | 'interview-as-interviewer'
  | 'interview-as-candidate'
  | 'lecture'
  | 'podcast'

type Density = 'compact' | 'standard'

type Props = {
  type: SessionType
  density?: Density
  label?: ReactNode
}

// session type → 工具类 key(Tailwind utility 命中 --color-type-<key>)
const TYPE_KEY: Record<SessionType, string> = {
  general: 'general',
  meeting: 'meeting',
  note: 'note',
  'interview-as-interviewer': 'interviewer',
  'interview-as-candidate': 'candidate',
  lecture: 'lecture',
  podcast: 'podcast',
}

const DEFAULT_LABEL: Record<SessionType, string> = {
  general: '通用',
  meeting: '会议',
  note: '笔记',
  'interview-as-interviewer': '面试官',
  'interview-as-candidate': '面试者',
  lecture: '课程',
  podcast: '播客',
}

// Tailwind 需要在编译时见到完整 class 名才能生成对应 CSS,所以这里枚举。
const BG_CLASS: Record<string, string> = {
  general: 'bg-type-general/10 text-type-general',
  meeting: 'bg-type-meeting/10 text-type-meeting',
  note: 'bg-type-note/10 text-type-note',
  interviewer: 'bg-type-interviewer/10 text-type-interviewer',
  candidate: 'bg-type-candidate/10 text-type-candidate',
  lecture: 'bg-type-lecture/10 text-type-lecture',
  podcast: 'bg-type-podcast/10 text-type-podcast',
}

const DOT_CLASS: Record<string, string> = {
  general: 'bg-type-general',
  meeting: 'bg-type-meeting',
  note: 'bg-type-note',
  interviewer: 'bg-type-interviewer',
  candidate: 'bg-type-candidate',
  lecture: 'bg-type-lecture',
  podcast: 'bg-type-podcast',
}

export function TypeBadge({ type, density = 'standard', label }: Props): React.JSX.Element {
  const key = TYPE_KEY[type]
  const text = label ?? DEFAULT_LABEL[type]

  if (density === 'compact') {
    return (
      <span
        className={`inline-block h-2 w-2 rounded-full ${DOT_CLASS[key]}`}
        aria-label={`${text} type`}
      />
    )
  }

  return (
    <span
      className={`inline-flex h-5 items-center gap-1 rounded-sm px-1.5 text-xs font-medium ${BG_CLASS[key]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[key]}`} />
      {text}
    </span>
  )
}
