import { ipcMain } from 'electron'
import { CHANNEL, ListArgs, ListResult } from '@shared/ipc/library'
import { assertSchemaDev } from '../util/assert-schema'
import { listLibrary } from '../library/library-store'

export function register(): void {
  ipcMain.handle(CHANNEL.list, async (_event, rawArgs: unknown) => {
    ListArgs.parse(rawArgs)
    const result = await listLibrary()
    assertSchemaDev(ListResult, result)
    return result
  })
}
