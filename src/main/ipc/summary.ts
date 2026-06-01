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
  ListTemplatesArgs,
  ListTemplatesResult,
  SetTemplateArgs,
  SetTemplateResult,
  ResetTemplateArgs,
  ResetTemplateResult,
} from '@shared/ipc/summary'
import type { SummaryTemplate as SummaryTemplateDto } from '@shared/ipc/summary'
import {
  summarize,
  cancelSummary,
  readSummaryText,
  testCloudConnection,
  setSummaryBroadcasters,
} from '../llm/summarizer'
import { listTemplates, getTemplate } from '../llm/templates'
import type { Template } from '../llm/templates'
import { getSettings, updateSettings } from '../settings/settings-store'
import { readMeta } from '../recording/meta-store'
import { assertSchemaDev } from '../util/assert-schema'
import { logger } from '../logger'

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

function toSummaryTemplate(t: Template): SummaryTemplateDto {
  return {
    id: t.id,
    name: t.name,
    icon: t.icon,
    sessionTypes: t.sessionTypes,
    systemPrompt: t.systemPrompt,
    defaultSystemPrompt: t.defaultSystemPrompt ?? t.systemPrompt,
    output: t.output,
    isCustomized: !!t.isCustomized,
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

  ipcMain.handle(CHANNEL.listTemplates, async (_event, rawArgs: unknown) => {
    ListTemplatesArgs.parse(rawArgs)
    const result: ListTemplatesResult = {
      templates: listTemplates().map(toSummaryTemplate),
      templatePerSessionType: getSettings().templates.templatePerSessionType,
    }
    assertSchemaDev(ListTemplatesResult, result)
    return result
  })

  ipcMain.handle(CHANNEL.setTemplate, async (_event, rawArgs: unknown) => {
    const args = SetTemplateArgs.parse(rawArgs)
    const current = getSettings().templates
    const templatePerSessionType = Object.fromEntries(
      Object.entries(current.templatePerSessionType).filter(
        ([, templateId]) => templateId !== args.id,
      ),
    )
    for (const sessionType of args.sessionTypes) {
      templatePerSessionType[sessionType] = args.id
    }
    await updateSettings({
      templates: {
        overrides: {
          ...current.overrides,
          [args.id]: { systemPrompt: args.systemPrompt, sessionTypes: args.sessionTypes },
        },
        templatePerSessionType,
      },
    })
    const template = getTemplate(args.id)
    if (!template) throw new Error(`template not found after save: ${args.id}`)
    const result: SetTemplateResult = {
      ok: true,
      template: toSummaryTemplate(template),
    }
    assertSchemaDev(SetTemplateResult, result)
    return result
  })

  ipcMain.handle(CHANNEL.resetTemplate, async (_event, rawArgs: unknown) => {
    const { id } = ResetTemplateArgs.parse(rawArgs)
    const current = getSettings().templates
    const { [id]: _removed, ...overrides } = current.overrides
    const templatePerSessionType = Object.fromEntries(
      Object.entries(current.templatePerSessionType).filter(([, templateId]) => templateId !== id),
    )
    await updateSettings({ templates: { overrides, templatePerSessionType } })
    const template = getTemplate(id)
    if (!template) throw new Error(`template not found after reset: ${id}`)
    const result: ResetTemplateResult = {
      ok: true,
      template: toSummaryTemplate(template),
    }
    assertSchemaDev(ResetTemplateResult, result)
    return result
  })
}
