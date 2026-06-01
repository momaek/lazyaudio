// 构造暴露给 renderer 的 white-list API 对象。
// renderer 只能调这里 export 的方法,不能直接拿到 ipcRenderer / electron / process。
//
// 关键约束:preload 在 sandbox: true 下不能 import 第三方运行时(zod 等),
// 否则 contextBridge 注入静默失败 → window.lazyaudio undefined。
// CHANNEL 名从 @shared/ipc/channels(纯字符串常量,无 zod)拿;schema 留给 main / renderer 业务层。
import { ipcRenderer } from 'electron'
import {
  ONBOARDING,
  SYSTEM,
  RECORD,
  AUDIO,
  LIBRARY,
  SETTINGS,
  PERMISSION,
  MODEL,
  TRANSCRIBE,
  SUMMARY,
} from '@shared/ipc/channels'
import type { LazyAudioApi } from '@shared/types/api'
import type { PingResult } from '@shared/ipc/system'
import type {
  StatusResult as OnboardingStatusResult,
  SetStepArgs as OnboardingSetStepArgs,
  SetStepResult as OnboardingSetStepResult,
  CompleteArgs as OnboardingCompleteArgs,
  CompleteResult as OnboardingCompleteResult,
  OpenSystemUpdateResult,
  QuitResult as OnboardingQuitResult,
} from '@shared/ipc/onboarding'
import type {
  PrepDefaults,
  StartArgs,
  StartResult,
  HidePrepResult,
  ShowPrepResult,
  RecorderSnapshot,
} from '@shared/ipc/record'
import type { ListResult } from '@shared/ipc/library'
import type { Settings, SetArgs } from '@shared/ipc/settings'
import type {
  MicStatusResult,
  RequestMicResult,
  OpenMicSettingsResult,
} from '@shared/ipc/permission'
import type {
  ListResult as ModelListResult,
  DownloadResult,
  CancelResult,
  DeleteResult,
  ModelEvent,
} from '@shared/ipc/model'
import type {
  GetTranscriptResult,
  RetryResult,
  SearchResult,
  StatusChangedEvent,
  LiveSegmentEvent,
  OfflineOverwriteEvent,
} from '@shared/ipc/transcribe'
import type {
  GenerateResult as SummaryGenerateResult,
  CancelResult as SummaryCancelResult,
  GetResult as SummaryGetResult,
  TestResult as SummaryTestResult,
  ChunkEvent as SummaryChunkEvent,
  DoneEvent as SummaryDoneEvent,
  ErrorEvent as SummaryErrorEvent,
} from '@shared/ipc/summary'
import type { StartCaptureArgs, StopCaptureArgs } from '@shared/audio/messages'
import { invoke } from './invoke'

export function makeApi(): LazyAudioApi {
  return {
    system: {
      ping: () => invoke<PingResult>(SYSTEM.ping),
    },
    onboarding: {
      status: () => invoke<OnboardingStatusResult>(ONBOARDING.status, {}),
      setStep: (args: OnboardingSetStepArgs) =>
        invoke<OnboardingSetStepResult>(ONBOARDING.setStep, args),
      complete: (args: OnboardingCompleteArgs) =>
        invoke<OnboardingCompleteResult>(ONBOARDING.complete, args),
      openSystemUpdate: () => invoke<OpenSystemUpdateResult>(ONBOARDING.openSystemUpdate, {}),
      quit: () => invoke<OnboardingQuitResult>(ONBOARDING.quit, {}),
      onRequestClose: (cb) => {
        const handler = (): void => cb()
        ipcRenderer.on(ONBOARDING.requestClose, handler)
        return () => ipcRenderer.off(ONBOARDING.requestClose, handler)
      },
    },
    record: {
      getPrepDefaults: () => invoke<PrepDefaults>(RECORD.getPrepDefaults),
      start: (args: StartArgs) => invoke<StartResult>(RECORD.start, args),
      stop: () => invoke<{ ok: boolean }>(RECORD.stop, {}),
      hidePrep: () => invoke<HidePrepResult>(RECORD.hidePrep),
      showPrep: () => invoke<ShowPrepResult>(RECORD.showPrep),
      getState: () => invoke<RecorderSnapshot>(RECORD.getState, {}),
      onStateChanged: (cb) => {
        const handler = (_e: unknown, snapshot: RecorderSnapshot): void => cb(snapshot)
        ipcRenderer.on(RECORD.stateChanged, handler)
        return () => ipcRenderer.off(RECORD.stateChanged, handler)
      },
    },
    library: {
      list: () => invoke<ListResult>(LIBRARY.list, {}),
    },
    settings: {
      get: () => invoke<Settings>(SETTINGS.get, {}),
      set: (patch: SetArgs) => invoke<Settings>(SETTINGS.set, patch),
      onChanged: (cb) => {
        const handler = (_e: unknown, settings: Settings): void => cb(settings)
        ipcRenderer.on(SETTINGS.changed, handler)
        return () => ipcRenderer.off(SETTINGS.changed, handler)
      },
    },
    permission: {
      getMicStatus: () => invoke<MicStatusResult>(PERMISSION.getMicStatus, {}),
      requestMic: () => invoke<RequestMicResult>(PERMISSION.requestMic, {}),
      openMicSettings: () => invoke<OpenMicSettingsResult>(PERMISSION.openMicSettings, {}),
    },
    model: {
      list: () => invoke<ModelListResult>(MODEL.list, {}),
      download: (modelKey: string) => invoke<DownloadResult>(MODEL.download, { modelKey }),
      cancel: (modelKey: string) => invoke<CancelResult>(MODEL.cancel, { modelKey }),
      delete: (modelKey: string) => invoke<DeleteResult>(MODEL.delete, { modelKey }),
      onEvent: (cb) => {
        const handler = (_e: unknown, event: ModelEvent): void => cb(event)
        ipcRenderer.on(MODEL.event, handler)
        return () => ipcRenderer.off(MODEL.event, handler)
      },
    },
    transcribe: {
      getTranscript: (recordingId: string) =>
        invoke<GetTranscriptResult>(TRANSCRIBE.getTranscript, { recordingId }),
      retry: (recordingId: string) => invoke<RetryResult>(TRANSCRIBE.retry, { recordingId }),
      search: (query: string) => invoke<SearchResult>(TRANSCRIBE.search, { query }),
      onStatusChanged: (cb) => {
        const handler = (_e: unknown, event: StatusChangedEvent): void => cb(event)
        ipcRenderer.on(TRANSCRIBE.statusChanged, handler)
        return () => ipcRenderer.off(TRANSCRIBE.statusChanged, handler)
      },
      onLiveSegment: (cb) => {
        const handler = (_e: unknown, event: LiveSegmentEvent): void => cb(event)
        ipcRenderer.on(TRANSCRIBE.liveSegment, handler)
        return () => ipcRenderer.off(TRANSCRIBE.liveSegment, handler)
      },
      onOfflineOverwrite: (cb) => {
        const handler = (_e: unknown, event: OfflineOverwriteEvent): void => cb(event)
        ipcRenderer.on(TRANSCRIBE.offlineOverwrite, handler)
        return () => ipcRenderer.off(TRANSCRIBE.offlineOverwrite, handler)
      },
    },
    summary: {
      generate: (recordingId: string, templateId?: string) =>
        invoke<SummaryGenerateResult>(SUMMARY.generate, { recordingId, templateId }),
      cancel: (recordingId: string) => invoke<SummaryCancelResult>(SUMMARY.cancel, { recordingId }),
      get: (recordingId: string) => invoke<SummaryGetResult>(SUMMARY.get, { recordingId }),
      testConnection: () => invoke<SummaryTestResult>(SUMMARY.testConnection, {}),
      onChunk: (cb) => {
        const handler = (_e: unknown, event: SummaryChunkEvent): void => cb(event)
        ipcRenderer.on(SUMMARY.chunk, handler)
        return () => ipcRenderer.off(SUMMARY.chunk, handler)
      },
      onDone: (cb) => {
        const handler = (_e: unknown, event: SummaryDoneEvent): void => cb(event)
        ipcRenderer.on(SUMMARY.done, handler)
        return () => ipcRenderer.off(SUMMARY.done, handler)
      },
      onError: (cb) => {
        const handler = (_e: unknown, event: SummaryErrorEvent): void => cb(event)
        ipcRenderer.on(SUMMARY.error, handler)
        return () => ipcRenderer.off(SUMMARY.error, handler)
      },
    },
    audio: {
      // capture window 订阅 main 发的启 capture 信令
      onStartCapture: (cb) => {
        const handler = (_e: unknown, args: StartCaptureArgs): void => cb(args)
        ipcRenderer.on(AUDIO.startCapture, handler)
        return () => ipcRenderer.off(AUDIO.startCapture, handler)
      },
      onStopCapture: (cb) => {
        const handler = (_e: unknown, args: StopCaptureArgs): void => cb(args)
        ipcRenderer.on(AUDIO.stopCapture, handler)
        return () => ipcRenderer.off(AUDIO.stopCapture, handler)
      },
      reportCaptureFailed: (args) => ipcRenderer.send(AUDIO.captureFailed, args),
    },
  }
}
