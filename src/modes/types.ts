import type { Component } from 'vue'

/**
 * Mode 类型
 * - primary: 主模式，互斥
 * - overlay: 叠加模式，可与主模式并存
 */
export type ModeType = 'primary' | 'overlay'

/**
 * Mode 布局类型
 * - default: 默认布局（全屏）
 * - floating: 悬浮窗布局
 */
export type ModeLayout = 'default' | 'floating'

/**
 * Mode 能力声明
 */
export interface ModeCapabilities {
  /** 是否需要系统音频 */
  systemAudio?: boolean
  /** 是否需要麦克风 */
  microphone?: boolean
  /** 是否需要 AI 功能 */
  ai?: boolean
  /** 是否支持标记 */
  markers?: boolean
}

/**
 * Mode 生命周期钩子
 */
export interface ModeHooks {
  /** Mode 被激活时调用 */
  onActivate?: () => void | Promise<void>
  /** Mode 被停用时调用 */
  onDeactivate?: () => void | Promise<void>
  /** Session 开始时调用 */
  onSessionStart?: (sessionId: string) => void | Promise<void>
  /** Session 结束时调用 */
  onSessionEnd?: (sessionId: string) => void | Promise<void>
}

/**
 * Mode 定义
 */
export interface ModeDefinition {
  /** 唯一标识符 */
  id: string
  /** 显示名称 */
  name: string
  /** 简短描述 */
  description: string
  /** 图标 (emoji 或 Lucide 图标名) */
  icon: string
  /** Mode 类型 */
  type: ModeType
  /** 布局类型 */
  layout: ModeLayout
  /** Vue 组件 */
  component: Component
  /** 能力声明 */
  capabilities: ModeCapabilities
  /** 生命周期钩子 */
  hooks?: ModeHooks
  /** 是否启用 (用于控制 overlay mode) */
  enabled?: boolean
  /** 触发快捷键 (overlay mode) */
  shortcut?: string
}

/**
 * 内置 Mode ID
 */
export const BUILTIN_MODE_IDS = {
  MEETING: 'meeting',
  INTERVIEWER: 'interviewer',
  INTERVIEWEE: 'interviewee',
  INPUT_METHOD: 'input-method',
} as const

/**
 * Mode ID 类型
 */
export type BuiltinModeId = typeof BUILTIN_MODE_IDS[keyof typeof BUILTIN_MODE_IDS]

