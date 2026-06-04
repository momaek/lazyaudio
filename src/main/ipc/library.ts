import { ipcMain, shell } from 'electron'
import fs from 'node:fs/promises'
import {
  CHANNEL,
  ListArgs,
  ListResult,
  RenameArgs,
  RenameResult,
  DeleteArgs,
  DeleteResult,
  ShowInFolderArgs,
  ShowInFolderResult,
} from '@shared/ipc/library'
import { assertSchemaDev } from '../util/assert-schema'
import { listLibrary } from '../library/library-store'
import { readMeta, writeMeta } from '../recording/meta-store'
import { getRecordingDir } from '../recording/paths'
import { getRecorderState } from '../audio/recorder-state'
import { logger } from '../logger'

export function register(): void {
  ipcMain.handle(CHANNEL.list, async (_event, rawArgs: unknown) => {
    ListArgs.parse(rawArgs)
    const result = await listLibrary()
    assertSchemaDev(ListResult, result)
    return result
  })

  // T55 — 重命名:改 meta.title(原子写)。renderer 拿到 ok 后自行 refresh 列表。
  ipcMain.handle(CHANNEL.rename, async (_event, rawArgs: unknown) => {
    const { recordingId, title } = RenameArgs.parse(rawArgs)
    let result: RenameResult
    const meta = await readMeta(recordingId)
    if (!meta) {
      result = { ok: false, error: 'recording-not-found' }
    } else {
      meta.title = title
      await writeMeta(meta)
      logger.info('[library] renamed', { recordingId })
      result = { ok: true }
    }
    assertSchemaDev(RenameResult, result)
    return result
  })

  // T55 — 删除:rm 整个录音目录。正在录这条时拒绝(守卫)。
  ipcMain.handle(CHANNEL.delete, async (_event, rawArgs: unknown) => {
    const { recordingId } = DeleteArgs.parse(rawArgs)
    let result: DeleteResult
    const rec = getRecorderState()
    if (
      rec.recordingId === recordingId &&
      (rec.status === 'recording' || rec.status === 'stopping')
    ) {
      result = { ok: false, error: 'recording-active' }
    } else {
      try {
        await fs.rm(getRecordingDir(recordingId), { recursive: true, force: true })
        logger.info('[library] deleted', { recordingId })
        result = { ok: true }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        logger.error('[library] delete failed', { recordingId, message })
        result = { ok: false, error: message }
      }
    }
    assertSchemaDev(DeleteResult, result)
    return result
  })

  // T55 — 在 Finder / 资源管理器中显示录音目录。
  ipcMain.handle(CHANNEL.showInFolder, async (_event, rawArgs: unknown) => {
    const { recordingId } = ShowInFolderArgs.parse(rawArgs)
    let result: ShowInFolderResult
    try {
      shell.showItemInFolder(getRecordingDir(recordingId))
      result = { ok: true }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      logger.error('[library] showInFolder failed', { recordingId, message })
      result = { ok: false, error: message }
    }
    assertSchemaDev(ShowInFolderResult, result)
    return result
  })
}
