// 启动时统一 wire 所有 IPC handler。在 app.whenReady() 之后调一次即可。
import { register as registerSystem } from './system'
import { register as registerRecord } from './record'
import { register as registerSettings } from './settings'
import { register as registerLibrary } from './library'
import { register as registerPermission } from './permission'
import { register as registerModel } from './model'
import { register as registerTranscribe } from './transcribe'
import { register as registerSummary } from './summary'

export function registerIpc(): void {
  registerSystem()
  registerRecord()
  registerSettings()
  registerLibrary()
  registerPermission()
  registerModel()
  registerTranscribe()
  registerSummary()
}
