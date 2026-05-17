/**
 * 持久化 JSON 的 schemaVersion 单一信息源(coding-conventions §1.6)。
 * 任何落盘 JSON 的 `schemaVersion` 字段都从这里取,不允许 hardcode 数字。
 * 升 version 必须同时改 migration(详见 data-model.md §10)。
 */
export const SCHEMA_VERSION = {
  settings: 1,
  recordingMeta: 1,
  transcript: 1,
  libraryIndex: 1,
  modelsManifest: 1,
  template: 1,
} as const
