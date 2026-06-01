// T50 — onboarding 域 schema + 类型。
//
// 屏 0(version-check)用于系统版本阻断;屏 1-7 的 step 持久化在 settings.json。

import { z } from 'zod'
import { OnboardingSettings, OnboardingStep, PrivacyMode } from './settings'
import { ONBOARDING as CHANNEL } from './channels'

export { CHANNEL, OnboardingSettings, OnboardingStep, PrivacyMode }
export type OnboardingState = z.infer<typeof OnboardingSettings>

export const PlatformSupport = z.object({
  ok: z.boolean(),
  platform: z.enum(['darwin', 'win32', 'unsupported']),
  detected: z.string(),
  title: z.string(),
  detail: z.string(),
  primaryLabel: z.string().optional(),
})
export type PlatformSupport = z.infer<typeof PlatformSupport>

export const StatusArgs = z.object({}).optional()
export type StatusArgs = z.infer<typeof StatusArgs>

export const StatusResult = z.object({
  done: z.boolean(),
  onboarding: OnboardingSettings,
  platform: PlatformSupport,
})
export type StatusResult = z.infer<typeof StatusResult>

export const SetStepArgs = z.object({
  step: OnboardingStep,
  privacyMode: PrivacyMode.optional(),
  complianceReminderHidden: z.boolean().optional(),
})
export type SetStepArgs = z.infer<typeof SetStepArgs>

export const SetStepResult = z.object({ ok: z.boolean(), onboarding: OnboardingSettings })
export type SetStepResult = z.infer<typeof SetStepResult>

export const CompleteArgs = z.object({
  action: z.enum(['open-main', 'start-recording']),
  privacyMode: PrivacyMode.optional(),
  complianceReminderHidden: z.boolean().optional(),
  cloud: z
    .object({
      baseUrl: z.string(),
      chatModel: z.string(),
      apiKey: z.string(),
    })
    .optional(),
})
export type CompleteArgs = z.infer<typeof CompleteArgs>

export const CompleteResult = z.object({ ok: z.boolean() })
export type CompleteResult = z.infer<typeof CompleteResult>

export const OpenSystemUpdateArgs = z.object({}).optional()
export type OpenSystemUpdateArgs = z.infer<typeof OpenSystemUpdateArgs>

export const OpenSystemUpdateResult = z.object({ ok: z.boolean() })
export type OpenSystemUpdateResult = z.infer<typeof OpenSystemUpdateResult>

export const QuitArgs = z.object({}).optional()
export type QuitArgs = z.infer<typeof QuitArgs>

export const QuitResult = z.object({ ok: z.boolean() })
export type QuitResult = z.infer<typeof QuitResult>
