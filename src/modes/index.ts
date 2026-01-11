import { modeRegistry } from './registry'
import { meetingMode } from './meeting'
import { interviewerMode } from './interviewer'
import { intervieweeMode } from './interviewee'
import { inputMethodMode } from './input-method'

/**
 * 注册所有内置 Modes
 */
export function registerBuiltinModes(): void {
  modeRegistry.register(meetingMode)
  modeRegistry.register(interviewerMode)
  modeRegistry.register(intervieweeMode)
  modeRegistry.register(inputMethodMode)
  
  console.log('[Modes] 已注册内置模式:', modeRegistry.list().map(m => m.id))
}

// 导出
export { modeRegistry } from './registry'
export * from './types'
export { meetingMode } from './meeting'
export { interviewerMode } from './interviewer'
export { intervieweeMode } from './interviewee'
export { inputMethodMode } from './input-method'
