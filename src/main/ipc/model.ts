// T31 — model domain IPC handlers。
//   - model:list     → registry × 磁盘状态(含 downloading)
//   - model:download → 受理后立即 ack;真正进度走 model:event 广播
//   - model:cancel   → abort 进行中的下载
//   - model:delete   → 删模型目录 + manifest
//   - model:event    → main → 所有 renderer 的下载生命周期广播

import { ipcMain, BrowserWindow } from 'electron'
import {
  CHANNEL,
  ListArgs,
  ListResult,
  DownloadArgs,
  DownloadResult,
  CancelArgs,
  CancelResult,
  DeleteArgs,
  DeleteResult,
  type ModelEvent,
} from '@shared/ipc/model'
import {
  listModels,
  downloadModel,
  cancelDownload,
  deleteModel,
} from '../transcribe/model/downloader'
import { assertSchemaDev } from '../util/assert-schema'
import { logger } from '../logger'

function broadcastModelEvent(event: ModelEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(CHANNEL.event, event)
  }
}

export function register(): void {
  ipcMain.handle(CHANNEL.list, async (_event, rawArgs: unknown) => {
    ListArgs.parse(rawArgs)
    const result: ListResult = { models: await listModels() }
    assertSchemaDev(ListResult, result)
    return result
  })

  ipcMain.handle(CHANNEL.download, async (_event, rawArgs: unknown) => {
    const { modelKey } = DownloadArgs.parse(rawArgs)
    logger.info('[model] download requested', { modelKey })
    // 不 await:下载是长任务,进度经 model:event 推;这里只受理
    void downloadModel(modelKey, broadcastModelEvent)
    const result: DownloadResult = { ok: true }
    assertSchemaDev(DownloadResult, result)
    return result
  })

  ipcMain.handle(CHANNEL.cancel, async (_event, rawArgs: unknown) => {
    const { modelKey } = CancelArgs.parse(rawArgs)
    const ok = cancelDownload(modelKey)
    const result: CancelResult = { ok }
    assertSchemaDev(CancelResult, result)
    return result
  })

  ipcMain.handle(CHANNEL.delete, async (_event, rawArgs: unknown) => {
    const { modelKey } = DeleteArgs.parse(rawArgs)
    logger.info('[model] delete', { modelKey })
    await deleteModel(modelKey)
    const result: DeleteResult = { ok: true }
    assertSchemaDev(DeleteResult, result)
    return result
  })
}
