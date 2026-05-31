// T51 — summary domain IPC handlers。
//   - summary:generate → 受理后台 summarize;进度走 summary:chunk/done/error 广播
//   - summary:cancel   → abort 进行中的摘要
//   - summary:get      → 取已生成摘要 + 状态
//   - summary:test-connection → 用当前云端设置发极短请求测连接

import { ipcMain, BrowserWindow } from 'electron'
import {
  CHANNEL,
  GenerateArgs,
  GenerateResult,
  CancelArgs,
  CancelResult,
  GetArgs,
  GetResult,
  TestArgs,
  TestResult,
} from '@shared/ipc/summary'
import {
  summarize,
  cancelSummary,
  readSummaryText,
  testCloudConnection,
  setSummaryBroadcasters,
} from '../llm/summarizer'
import { readMeta } from '../recording/meta-store'
import { assertSchemaDev } from '../util/assert-schema'
import { logger } from '../logger'

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

export function register(): void {
  setSummaryBroadcasters({
    onChunk: (recordingId, delta) => broadcast(CHANNEL.chunk, { recordingId, delta }),
    onDone: (recordingId) => broadcast(CHANNEL.done, { recordingId }),
    onError: (recordingId, code, message) =>
      broadcast(CHANNEL.error, { recordingId, code, message }),
  })

  ipcMain.handle(CHANNEL.generate, async (_event, rawArgs: unknown) => {
    const { recordingId, templateId } = GenerateArgs.parse(rawArgs)
    logger.info('[summary] generate requested', { recordingId, templateId })
    void summarize(recordingId, templateId === undefined ? {} : { templateId })
    const result: GenerateResult = { ok: true }
    assertSchemaDev(GenerateResult, result)
    return result
  })

  ipcMain.handle(CHANNEL.cancel, async (_event, rawArgs: unknown) => {
    const { recordingId } = CancelArgs.parse(rawArgs)
    const ok = cancelSummary(recordingId)
    const result: CancelResult = { ok }
    assertSchemaDev(CancelResult, result)
    return result
  })

  ipcMain.handle(CHANNEL.get, async (_event, rawArgs: unknown) => {
    const { recordingId } = GetArgs.parse(rawArgs)
    const meta = await readMeta(recordingId)
    const text = await readSummaryText(recordingId)
    const result: GetResult = {
      status: meta?.summary?.status ?? 'idle',
      text,
      templateId: meta?.summary?.templateId,
      model: meta?.summary?.model,
      error: meta?.summary?.error,
    }
    assertSchemaDev(GetResult, result)
    return result
  })

  ipcMain.handle(CHANNEL.testConnection, async (_event, rawArgs: unknown) => {
    TestArgs.parse(rawArgs)
    const result: TestResult = await testCloudConnection()
    assertSchemaDev(TestResult, result)
    return result
  })
}
