// T18 — settings 域 schema + 类型。
//
// 设计来源:screen-specs/settings.md Tab1(通用)+ Tab5(快捷键)。
// T18 只落「通用 + 快捷键」两块;录音 / 转录引擎 / LLM / 隐私 / 关于 等字段
// 由 T38 / T52 / T57 等按需补(改 schemaVersion 才需破坏性 migration)。
//
// 注:settings.md 与 mockup settings.jsx 的「通用」tab 字段有冲突,按 CLAUDE.md「冲突以
// screen-specs 为准」,这里取 settings.md 的字段(启动与窗口 / 外观 / 默认会话类型)。

import { z } from 'zod'
import { SessionType } from './record'
import { SCHEMA_VERSION } from '../schema-version'
import { TEMPLATE_IDS } from '../llm/templates'
export { SETTINGS as CHANNEL } from './channels'

export const ThemeMode = z.enum(['light', 'dark', 'system'])
export type ThemeMode = z.infer<typeof ThemeMode>

export const CloseMainWindowBehavior = z.enum(['minimize', 'quit'])
export type CloseMainWindowBehavior = z.infer<typeof CloseMainWindowBehavior>

export const TrayClickBehavior = z.enum(['menu', 'record', 'window'])
export type TrayClickBehavior = z.infer<typeof TrayClickBehavior>

export const ListDensity = z.enum(['compact', 'comfortable'])
export type ListDensity = z.infer<typeof ListDensity>

/** 录前默认会话类型:'last' = 沿用上次,否则固定某类型 */
export const DefaultSessionType = z.union([z.literal('last'), SessionType])
export type DefaultSessionType = z.infer<typeof DefaultSessionType>

export const GeneralSettings = z.object({
  openAtLogin: z.boolean(),
  closeMainWindowBehavior: CloseMainWindowBehavior,
  showMainWindowOnLaunch: z.boolean(),
  trayClickBehavior: TrayClickBehavior,
  theme: ThemeMode,
  language: z.literal('zh-CN'), // v0.1 仅简体中文
  listDensity: ListDensity,
  defaultSessionType: DefaultSessionType,
  skipPrepPopover: z.boolean(),
})
export type GeneralSettings = z.infer<typeof GeneralSettings>

export const ShortcutSettings = z.object({
  /** 开始 / 停止录音的全局快捷键,Electron accelerator 字符串 */
  toggleRecord: z.string().min(1),
})
export type ShortcutSettings = z.infer<typeof ShortcutSettings>

/** T57 — 录音设置(settings.md Tab2)。saveDir='' 用默认 recordings 目录;
 *  字段级 .default 保证老 settings.json 缺 recording 块仍能 parse。
 *  注:采样率/分轨/混音/命名/静音自停/最短录音/电平表 在 v0.1 持久化保存,
 *  录音管线接入后才真正生效(本任务先存,标「录制时生效」)。 */
export const WavSampleRate = z.union([z.literal(16000), z.literal(24000), z.literal(48000)])
export type WavSampleRate = z.infer<typeof WavSampleRate>

export const RecordingSettings = z.object({
  saveDir: z.string().default(''),
  autoTranscribe: z.boolean().default(true),
  autoCleanupEnabled: z.boolean().default(false),
  autoCleanupDays: z.number().int().min(7).max(365).default(90),
  generateTracks: z.boolean().default(true),
  generateMixed: z.boolean().default(true),
  wavSampleRate: WavSampleRate.default(16000),
  fileNameFormat: z.string().min(1).default('{sessionType}_{date}_{time}'),
  minDurationSec: z.number().int().min(0).max(10).default(2),
  silenceAutoStopEnabled: z.boolean().default(false),
  silenceAutoStopSec: z.number().int().min(30).max(600).default(60),
  showLevelMeter: z.boolean().default(true),
})
export type RecordingSettings = z.infer<typeof RecordingSettings>

export const DEFAULT_RECORDING: RecordingSettings = {
  saveDir: '',
  autoTranscribe: true,
  autoCleanupEnabled: false,
  autoCleanupDays: 90,
  generateTracks: true,
  generateMixed: true,
  wavSampleRate: 16000,
  fileNameFormat: '{sessionType}_{date}_{time}',
  minDurationSec: 2,
  silenceAutoStopEnabled: false,
  silenceAutoStopSec: 60,
  showLevelMeter: true,
}

/** T51 — 云端 LLM 配置(OpenAI 兼容)。apiKeyCipher = safeStorage 加密后的 base64,
 *  '' 表示未配置;renderer 只读密文(无法解密,safeStorage 在 main),永不见明文。 */
export const CloudSettings = z.object({
  baseUrl: z.string(),
  chatModel: z.string(),
  /** T53 — 云端转录模型名(OpenAI 兼容 Audio API,如 whisper-1);'' 表示未配置。
   *  .default 保证老 settings.json(已有 cloud 但无此字段)仍能 parse,不丢已配的 key */
  transcribeModel: z.string().default(''),
  contextWindow: z.number().int().positive(),
  autoSummary: z.boolean(),
  apiKeyCipher: z.string(),
})
export type CloudSettings = z.infer<typeof CloudSettings>

export const TemplateId = z.enum(TEMPLATE_IDS)
export type TemplateId = z.infer<typeof TemplateId>

export const TemplateOverride = z.object({
  systemPrompt: z.string().min(1).optional(),
  sessionTypes: z.array(SessionType).min(1).optional(),
})
export type TemplateOverride = z.infer<typeof TemplateOverride>

export const TemplateSettings = z.object({
  overrides: z.partialRecord(TemplateId, TemplateOverride),
  templatePerSessionType: z.partialRecord(SessionType, TemplateId),
})
export type TemplateSettings = z.infer<typeof TemplateSettings>

export const DEFAULT_TEMPLATES: TemplateSettings = {
  overrides: {},
  templatePerSessionType: {},
}

export const OnboardingStep = z.enum([
  'version-check',
  'welcome',
  'privacy',
  'permission',
  'model-download',
  'api-config',
  'shortcut',
  'compliance',
  'done',
])
export type OnboardingStep = z.infer<typeof OnboardingStep>

export const PrivacyMode = z.enum(['local', 'cloud'])
export type PrivacyMode = z.infer<typeof PrivacyMode>

export const OnboardingSettings = z.object({
  completedAt: z.number().int().optional(),
  step: OnboardingStep.optional(),
  privacyMode: PrivacyMode,
  complianceReminderHidden: z.boolean(),
})
export type OnboardingSettings = z.infer<typeof OnboardingSettings>

export const DEFAULT_ONBOARDING: OnboardingSettings = {
  privacyMode: 'local',
  complianceReminderHidden: false,
}

export const DEFAULT_CLOUD: CloudSettings = {
  baseUrl: '',
  chatModel: '',
  transcribeModel: '',
  contextWindow: 128000,
  autoSummary: true,
  apiKeyCipher: '',
}

export const Settings = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION.settings),
  general: GeneralSettings,
  shortcuts: ShortcutSettings,
  // .default 保证老 settings.json(无 recording 字段)仍能 parse
  recording: RecordingSettings.default(DEFAULT_RECORDING),
  // .default 保证老 settings.json(无 cloud 字段)仍能 parse,不丢用户已有设置
  cloud: CloudSettings.default(DEFAULT_CLOUD),
  templates: TemplateSettings.default(DEFAULT_TEMPLATES),
  onboarding: OnboardingSettings.default(DEFAULT_ONBOARDING),
})
export type Settings = z.infer<typeof Settings>

export const DEFAULT_TOGGLE_RECORD_ACCEL = 'CommandOrControl+Shift+R'

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: SCHEMA_VERSION.settings,
  general: {
    openAtLogin: false,
    closeMainWindowBehavior: 'minimize',
    showMainWindowOnLaunch: false,
    trayClickBehavior: 'menu',
    theme: 'system',
    language: 'zh-CN',
    listDensity: 'compact',
    defaultSessionType: 'last',
    skipPrepPopover: false,
  },
  shortcuts: {
    toggleRecord: DEFAULT_TOGGLE_RECORD_ACCEL,
  },
  recording: DEFAULT_RECORDING,
  cloud: DEFAULT_CLOUD,
  templates: DEFAULT_TEMPLATES,
  onboarding: DEFAULT_ONBOARDING,
}

// ---- IPC args / results ----
export const GetArgs = z.object({}).optional()
export type GetArgs = z.infer<typeof GetArgs>

/** cloud 的 set:非密钥字段直接传;apiKey 传**明文**,main 端 encrypt 成 apiKeyCipher
 *  (renderer 不传 apiKeyCipher;空串 apiKey = 清除密钥) */
export const CloudSetArgs = z.object({
  baseUrl: z.string().optional(),
  chatModel: z.string().optional(),
  transcribeModel: z.string().optional(),
  contextWindow: z.number().int().positive().optional(),
  autoSummary: z.boolean().optional(),
  apiKey: z.string().optional(),
})
export type CloudSetArgs = z.infer<typeof CloudSetArgs>

/** zod 的 .partial() 不会剥掉字段上的 .default():parse 一个只含部分键的 patch 时,
 *  缺失字段会被默认值回填(如 RecordingSettings.partial().parse({silenceAutoStopSec:90})
 *  会带出 silenceAutoStopEnabled:false)。随后 mergeSettings 里 {...current, ...patch}
 *  就把用户已设的值覆盖回默认(典型:改静音秒数时开关被打回 false)。
 *  这里先 removeDefault 再 .partial(),保证 patch 只携带调用方真正传的键。
 *  removeDefault 不改输出类型,故 cast 回 ZodObject<T> 是安全的。 */
function patchSchema<T extends z.ZodRawShape>(schema: z.ZodObject<T>): z.ZodObject<T> {
  const shape = schema.shape as unknown as Record<string, z.ZodType>
  const next: Record<string, z.ZodType> = {}
  for (const key of Object.keys(shape)) {
    const field = shape[key] as z.ZodType
    next[key] =
      field instanceof z.ZodDefault ? (field.removeDefault() as unknown as z.ZodType) : field
  }
  return z.object(next) as unknown as z.ZodObject<T>
}

/** set:部分更新(只传要改的子键);main 合并后整体校验再落盘 */
export const SetArgs = z.object({
  general: patchSchema(GeneralSettings).partial().optional(),
  shortcuts: patchSchema(ShortcutSettings).partial().optional(),
  recording: patchSchema(RecordingSettings).partial().optional(),
  cloud: CloudSetArgs.optional(),
  templates: patchSchema(TemplateSettings).partial().optional(),
  // T53 — 设置页「转录引擎」本地/云端切换写 onboarding.privacyMode(转录路由信号)
  onboarding: patchSchema(OnboardingSettings).partial().optional(),
})
export type SetArgs = z.infer<typeof SetArgs>

// ---- T57 录音目录选择 / Finder / 危险操作 ----
export const PickDirArgs = z.object({}).optional()
export const PickDirResult = z.object({
  canceled: z.boolean(),
  /** 选中的目录绝对路径(canceled=false 时有) */
  path: z.string().optional(),
})
export type PickDirResult = z.infer<typeof PickDirResult>

export const OpenDirResult = z.object({ ok: z.boolean(), error: z.string().optional() })
export type OpenDirResult = z.infer<typeof OpenDirResult>

export const DangerAction = z.enum(['clear-recordings', 'clear-models', 'reset-app', 'wipe-all'])
export type DangerAction = z.infer<typeof DangerAction>

export const DangerActionArgs = z.object({ action: DangerAction })
export type DangerActionArgs = z.infer<typeof DangerActionArgs>

export const DangerActionResult = z.object({
  ok: z.boolean(),
  /** 'recording-active' = 录音中,清空录音被拒 */
  error: z.string().optional(),
})
export type DangerActionResult = z.infer<typeof DangerActionResult>
