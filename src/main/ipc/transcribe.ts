// T32/T33/T37/T39 — transcribe domain IPC handlers。
//   - transcribe:get-transcript → 取某录音的 transcript + 状态
//   - transcribe:retry          → 强制重跑 Pass B(失败重试 / 手动触发)
//   - transcribe:search         → 全文搜索
//   - transcribe:status-changed → main → renderer 状态广播(编排器经 broadcaster 触发)

import { ipcMain, BrowserWindow, Notification } from 'electron'
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
import { LIBRARY } from '@shared/ipc/channels'
import { readMeta } from '../recording/meta-store'
import { readTranscript } from '../transcribe/transcript-store'
import { readLiveTranscript } from '../transcribe/live-store'
import { getMainWindow, showMainWindow } from '../windows/main-window'
import {
  enqueueTranscription,
  setTranscribeBroadcaster,
  setLiveBroadcaster,
  setOverwriteBroadcaster,
} from '../transcribe/orchestrator'
import { searchTranscripts } from '../transcribe/search'
import type { LiveSegment } from '@shared/transcribe/streaming-protocol'
import { assertSchemaDev } from '../util/assert-schema'
import { logger } from '../logger'

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

function broadcastStatus(event: StatusChangedEvent): void {
  broadcast(CHANNEL.statusChanged, event)
  if (event.status === 'done' || event.status === 'failed') {
    void notifyTranscribeResult(event.recordingId, event.status)
  }
}

// T56 — 转录完成 / 失败弹系统通知;点通知 → 主窗口 + 定位到该录音。
// 主窗口已聚焦时不打扰(用户正看着)。
async function notifyTranscribeResult(
  recordingId: string,
  status: 'done' | 'failed',
): Promise<void> {
  if (!Notification.isSupported()) return
  if (getMainWindow()?.isFocused()) return
  const meta = await readMeta(recordingId)
  const name = meta?.title ?? '录音'
  const n = new Notification({
    title: status === 'done' ? '转录完成' : '转录失败',
    body: status === 'done' ? name : `${name} — 转录失败，点按查看`,
  })
  n.on('click', () => {
    showMainWindow()
    broadcast(LIBRARY.activate, { recordingId })
  })
  n.show()
}

export function register(): void {
  // 编排器(可能由 record:stop 触发,非 IPC)经此把状态广播到 renderer
  setTranscribeBroadcaster(broadcastStatus)
  setLiveBroadcaster((recordingId: string, segment: LiveSegment) =>
    broadcast(CHANNEL.liveSegment, { recordingId, segment }),
  )
  setOverwriteBroadcaster((recordingId: string) =>
    broadcast(CHANNEL.offlineOverwrite, { recordingId }),
  )

  ipcMain.handle(CHANNEL.getTranscript, async (_event, rawArgs: unknown) => {
    const { recordingId } = GetTranscriptArgs.parse(rawArgs)
    const meta = await readMeta(recordingId)
    // transcript.json(Pass B)优先;缺则回退 transcript.live.json(Pass A)
    const transcript =
      (await readTranscript(recordingId)) ?? (await readLiveTranscript(recordingId))
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
