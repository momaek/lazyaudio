import type { ModeDefinition } from '../types'
import { BUILTIN_MODE_IDS } from '../types'
import FloatingInputMethod from '@/views/floating/FloatingInputMethod.vue'

/**
 * 输入法模式定义
 */
export const inputMethodMode: ModeDefinition = {
  id: BUILTIN_MODE_IDS.INPUT_METHOD,
  name: '输入法模式',
  description: '全局快捷键唤起的语音输入模式',
  icon: '⌨️',
  type: 'overlay',
  layout: 'floating',
  component: FloatingInputMethod,
  capabilities: {
    microphone: true,
  },
  enabled: true,
  shortcut: 'CommandOrControl+Shift+Space',
  hooks: {
    onActivate: () => {
      console.log('[InputMethodMode] 激活')
    },
    onDeactivate: () => {
      console.log('[InputMethodMode] 停用')
    },
  },
}
