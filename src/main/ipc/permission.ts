// T20 — permission 域 IPC handlers。
import { ipcMain } from 'electron'
import {
  CHANNEL,
  GetMicStatusArgs,
  MicStatusResult,
  RequestMicArgs,
  RequestMicResult,
  OpenMicSettingsArgs,
  OpenMicSettingsResult,
} from '@shared/ipc/permission'
import { getMicStatus, requestMic, openMicSettings, isMicGranted } from '../permission/mic'
import { assertSchemaDev } from '../util/assert-schema'

export function register(): void {
  ipcMain.handle(CHANNEL.getMicStatus, async (_event, rawArgs: unknown) => {
    GetMicStatusArgs.parse(rawArgs)
    const result = { status: getMicStatus() }
    assertSchemaDev(MicStatusResult, result)
    return result
  })

  ipcMain.handle(CHANNEL.requestMic, async (_event, rawArgs: unknown) => {
    RequestMicArgs.parse(rawArgs)
    const status = await requestMic()
    const result = { status, granted: isMicGranted(status) }
    assertSchemaDev(RequestMicResult, result)
    return result
  })

  ipcMain.handle(CHANNEL.openMicSettings, async (_event, rawArgs: unknown) => {
    OpenMicSettingsArgs.parse(rawArgs)
    const result = { ok: await openMicSettings() }
    assertSchemaDev(OpenMicSettingsResult, result)
    return result
  })
}
