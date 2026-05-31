// T32/T33/T37/T39 — transcribe domain IPC handlers。
//   - transcribe:get-transcript → 取某录音的 transcript + 状态
//   - transcribe:retry          → 强制重跑 Pass B(失败重试 / 手动触发)
//   - transcribe:search         → 全文搜索
//   - transcribe:status-changed → main → renderer 状态广播(编排器经 broadcaster 触发)

import { ipcMain, BrowserWindow } from 'electron'
import {
  CHANNEL,
  GetTranscriptArgs,
  GetTranscriptResult,
  RetryArgs,
  RetryResult,
  SearchArgs,
  SearchResult,
  type StatusChangedEvent,
} from '@shared/ipc/transcribe'
import { readMeta } from '../recording/meta-store'
import { readTranscript } from '../transcribe/transcript-store'
import { enqueueTranscription, setTranscribeBroadcaster } from '../transcribe/orchestrator'
import { searchTranscripts } from '../transcribe/search'
import { assertSchemaDev } from '../util/assert-schema'
import { logger } from '../logger'

function broadcastStatus(event: StatusChangedEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(CHANNEL.statusChanged, event)
  }
}

export function register(): void {
  // 编排器(可能由 record:stop 触发,非 IPC)经此把状态广播到 renderer
  setTranscribeBroadcaster(broadcastStatus)

  ipcMain.handle(CHANNEL.getTranscript, async (_event, rawArgs: unknown) => {
    const { recordingId } = GetTranscriptArgs.parse(rawArgs)
    const meta = await readMeta(recordingId)
    const transcript = await readTranscript(recordingId)
    const result: GetTranscriptResult = {
      status: meta?.transcribe?.status ?? 'idle',
      transcript,
      error: meta?.transcribe?.error,
    }
    assertSchemaDev(GetTranscriptResult, result)
    return result
  })

  ipcMain.handle(CHANNEL.retry, async (_event, rawArgs: unknown) => {
    const { recordingId } = RetryArgs.parse(rawArgs)
    logger.info('[transcribe] retry requested', { recordingId })
    enqueueTranscription(recordingId, { force: true })
    const result: RetryResult = { ok: true }
    assertSchemaDev(RetryResult, result)
    return result
  })

  ipcMain.handle(CHANNEL.search, async (_event, rawArgs: unknown) => {
    const { query } = SearchArgs.parse(rawArgs)
    const result = await searchTranscripts(query)
    assertSchemaDev(SearchResult, result)
    return result
  })
}
