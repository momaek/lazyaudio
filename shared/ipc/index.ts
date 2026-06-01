// shared/ipc/ 的入口 re-export。
// preload / main / renderer 都通过这里拿 CHANNEL 名 + zod schema。
export * as System from './system'
export * as Record from './record'
export * as Settings from './settings'
export * as Onboarding from './onboarding'
export * as Library from './library'
export * as Permission from './permission'
export * as Model from './model'
export * as Transcribe from './transcribe'
export * as Summary from './summary'
