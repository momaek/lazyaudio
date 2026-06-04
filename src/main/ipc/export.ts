// T54 — export domain IPC handler。
//   - export:run → 汇集录音数据 → 渲染 md/txt/srt → 弹保存对话框 → 落盘
//
// 文件落用户在 save dialog 选的路径(无默认目录约定)。失败 / 取消都回结构化结果,不抛到 renderer。

import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'node:fs/promises'
import { CHANNEL, RunArgs, RunResult, type ExportFormat } from '@shared/ipc/export'
import { collectExportData } from '../export/collect'
import { renderExport, defaultExportBaseName } from '../export/format'
import { assertSchemaDev } from '../util/assert-schema'
import { logger } from '../logger'

const FORMAT_FILTER: Record<ExportFormat, { name: string; ext: string }> = {
  md: { name: 'Markdown', ext: 'md' },
  txt: { name: '纯文本', ext: 'txt' },
  srt: { name: '字幕 SRT', ext: 'srt' },
}

export function register(): void {
  ipcMain.handle(CHANNEL.run, async (_event, rawArgs: unknown) => {
    const { recordingId, format } = RunArgs.parse(rawArgs)

    let result: RunResult
    try {
      const data = await collectExportData(recordingId)
      if (!data) {
        result = { ok: false, canceled: false, error: 'recording-not-found' }
      } else {
        const content = renderExport(format, data)
        const filter = FORMAT_FILTER[format]
        const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
        const dialogOpts = {
          defaultPath: `${defaultExportBaseName(data.meta)}.${filter.ext}`,
          filters: [{ name: filter.name, extensions: [filter.ext] }],
        }
        const picked = win
          ? await dialog.showSaveDialog(win, dialogOpts)
          : await dialog.showSaveDialog(dialogOpts)
        if (picked.canceled || !picked.filePath) {
          result = { ok: true, canceled: true }
        } else {
          await fs.writeFile(picked.filePath, content, 'utf8')
          logger.info('[export] done', { recordingId, format, filePath: picked.filePath })
          result = { ok: true, canceled: false, filePath: picked.filePath }
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      logger.error('[export] failed', { recordingId, format, message })
      result = { ok: false, canceled: false, error: message }
    }

    assertSchemaDev(RunResult, result)
    return result
  })
}
