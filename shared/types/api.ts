// preload 通过 contextBridge 暴露给 renderer 的 API 接口。
// renderer 在 src/renderer/global.d.ts 把 window.lazyaudio: LazyAudioApi 注册成全局类型。

import type { PingResult, OpenExternalResult as SystemOpenExternalResult } from '../ipc/system'
import type {
  StatusResult as OnboardingStatusResult,
  SetStepArgs as OnboardingSetStepArgs,
  SetStepResult as OnboardingSetStepResult,
  CompleteArgs as OnboardingCompleteArgs,
  CompleteResult as OnboardingCompleteResult,
  OpenSystemUpdateResult,
  QuitResult as OnboardingQuitResult,
} from '../ipc/onboarding'
import type {
  PrepDefaults,
  StartArgs,
  StartResult,
  HidePrepResult,
  ShowPrepResult,
  RecorderSnapshot,
} from '../ipc/record'
import type {
  ListResult,
  RenameResult as LibraryRenameResult,
  DeleteResult as LibraryDeleteResult,
  ShowInFolderResult as LibraryShowInFolderResult,
  ActivateEvent as LibraryActivateEvent,
} from '../ipc/library'
import type {
  Settings,
  SetArgs,
  PickDirResult as SettingsPickDirResult,
  OpenDirResult as SettingsOpenDirResult,
  DangerAction as SettingsDangerAction,
  DangerActionResult as SettingsDangerActionResult,
} from '../ipc/settings'
import type { MicStatusResult, RequestMicResult, OpenMicSettingsResult } from '../ipc/permission'
import type {
  ListResult as ModelListResult,
  DownloadResult as ModelDownloadResult,
  CancelResult as ModelCancelResult,
  DeleteResult as ModelDeleteResult,
  ModelEvent,
} from '../ipc/model'
import type {
  GetTranscriptResult,
  RetryResult as TranscribeRetryResult,
  SearchResult as TranscribeSearchResult,
  StatusChangedEvent as TranscribeStatusChangedEvent,
  LiveSegmentEvent,
  OfflineOverwriteEvent,
} from '../ipc/transcribe'
import type {
  GenerateResult as SummaryGenerateResult,
  CancelResult as SummaryCancelResult,
  GetResult as SummaryGetResult,
  TestResult as SummaryTestResult,
  ChunkEvent as SummaryChunkEvent,
  DoneEvent as SummaryDoneEvent,
  ErrorEvent as SummaryErrorEvent,
  ListTemplatesResult,
  SetTemplateArgs,
  SetTemplateResult,
  ResetTemplateResult,
} from '../ipc/summary'
import type { ExportFormat, RunResult as ExportRunResult } from '../ipc/export'
import type { StartCaptureArgs, StopCaptureArgs, CaptureFailedArgs } from '../audio/messages'

export interface LazyAudioApi {
  system: {
    ping(): Promise<PingResult>
    /** T57 用默认浏览器打开外链(关于页) */
    openExternal(url: string): Promise<SystemOpenExternalResult>
  }
  onboarding: {
    status(): Promise<OnboardingStatusResult>
    setStep(args: OnboardingSetStepArgs): Promise<OnboardingSetStepResult>
    complete(args: OnboardingCompleteArgs): Promise<OnboardingCompleteResult>
    openSystemUpdate(): Promise<OpenSystemUpdateResult>
    quit(): Promise<OnboardingQuitResult>
    onRequestClose(cb: () => void): () => void
  }
  record: {
    /** prep 浮窗 mount 时拉默认 sessionType + sources */
    getPrepDefaults(): Promise<PrepDefaults>
    /** 用户在 prep 浮窗点"开始录音"/Enter 时调;T12 起接录音状态机 + 触发 capture */
    start(args: StartArgs): Promise<StartResult>
    /** 用户主动 / shortcut 双向触发停录音(T12) */
    stop(): Promise<{ ok: boolean }>
    /** 取消按钮 / Esc 通知 main 隐藏 prep 浮窗 */
    hidePrep(): Promise<HidePrepResult>
    /** 主窗口空状态「开始录音」按钮:通知 main 弹 prep 浮窗(等价 ⌘⇧R / tray) */
    showPrep(): Promise<ShowPrepResult>
    /** 主窗口 mount 时拉一次当前录音状态快照 */
    getState(): Promise<RecorderSnapshot>
    /** 订阅录音状态变更广播(main 每次状态转换后发);返回取消订阅函数 */
    onStateChanged(cb: (snapshot: RecorderSnapshot) => void): () => void
  }
  library: {
    /** T15 录音库 v0.1:按日期分组返回 recordings 下的 meta 快照 */
    list(): Promise<ListResult>
    /** T55 重命名(改 meta.title) */
    rename(recordingId: string, title: string): Promise<LibraryRenameResult>
    /** T55 删除录音(rm 目录;正在录这条会被拒) */
    delete(recordingId: string): Promise<LibraryDeleteResult>
    /** T55 在 Finder / 资源管理器显示录音目录 */
    showInFolder(recordingId: string): Promise<LibraryShowInFolderResult>
    /** T56 订阅:点系统通知后定位到该录音 */
    onActivate(cb: (event: LibraryActivateEvent) => void): () => void
  }
  settings: {
    /** 拉当前完整 settings(窗口 mount 时调) */
    get(): Promise<Settings>
    /** 部分更新 settings;main 合并落盘后返回新的完整 settings */
    set(patch: SetArgs): Promise<Settings>
    /** T57 选录音保存目录(弹目录对话框);返回路径(取消则 canceled) */
    pickRecordingsDir(): Promise<SettingsPickDirResult>
    /** T57 在 Finder / 资源管理器打开录音目录 */
    openRecordingsDir(): Promise<SettingsOpenDirResult>
    /** T57 危险操作(清空录音 / 模型 / 重置 / 完全清除) */
    dangerAction(action: SettingsDangerAction): Promise<SettingsDangerActionResult>
    /** 订阅 settings 变更广播;返回取消订阅函数 */
    onChanged(cb: (settings: Settings) => void): () => void
  }
  permission: {
    /** T20 查麦克风权限状态 */
    getMicStatus(): Promise<MicStatusResult>
    /** 触发系统授权框(仅 not-determined 有效);返回最终状态 */
    requestMic(): Promise<RequestMicResult>
    /** 跳到系统设置麦克风隐私页 */
    openMicSettings(): Promise<OpenMicSettingsResult>
  }
  model: {
    /** T31 列出所有内置模型 + 磁盘状态(available / downloading / downloaded) */
    list(): Promise<ModelListResult>
    /** 触发下载某模型;立即 ack,进度走 onEvent */
    download(modelKey: string): Promise<ModelDownloadResult>
    /** 取消进行中的下载 */
    cancel(modelKey: string): Promise<ModelCancelResult>
    /** 删除已下载模型(目录 + manifest) */
    delete(modelKey: string): Promise<ModelDeleteResult>
    /** 订阅下载生命周期事件(start/progress/source-switched/done/error/cancelled);返回取消订阅函数 */
    onEvent(cb: (event: ModelEvent) => void): () => void
  }
  transcribe: {
    /** T33 取某录音的 transcript + 转录状态 */
    getTranscript(recordingId: string): Promise<GetTranscriptResult>
    /** T37 强制重跑 Pass B(失败重试 / 手动触发) */
    retry(recordingId: string): Promise<TranscribeRetryResult>
    /** T39 全文搜索 */
    search(query: string): Promise<TranscribeSearchResult>
    /** 订阅转录状态广播(running/done/failed + 进度);返回取消订阅函数 */
    onStatusChanged(cb: (event: TranscribeStatusChangedEvent) => void): () => void
    /** T34 订阅 Pass A 实时段(hypothesis/confirmed,同 id 原地替换);返回取消订阅函数 */
    onLiveSegment(cb: (event: LiveSegmentEvent) => void): () => void
    /** T36 订阅 Pass B 覆盖事件(整体换 transcript.json);返回取消订阅函数 */
    onOfflineOverwrite(cb: (event: OfflineOverwriteEvent) => void): () => void
  }
  summary: {
    /** T51 生成摘要(不传 templateId = 按 sessionType 自动选);流式走 onChunk */
    generate(recordingId: string, templateId?: string): Promise<SummaryGenerateResult>
    /** 取消进行中的摘要 */
    cancel(recordingId: string): Promise<SummaryCancelResult>
    /** 取已生成摘要 + 状态 */
    get(recordingId: string): Promise<SummaryGetResult>
    /** 用当前云端设置测试连接 */
    testConnection(): Promise<SummaryTestResult>
    /** T52:列出内置模板 + 用户覆盖 */
    listTemplates(): Promise<ListTemplatesResult>
    /** T52:保存某模板的 prompt / sessionType 映射 */
    setTemplate(args: SetTemplateArgs): Promise<SetTemplateResult>
    /** T52:清掉某模板的用户覆盖 */
    resetTemplate(templateId: string): Promise<ResetTemplateResult>
    /** 订阅流式 delta;返回取消订阅函数 */
    onChunk(cb: (event: SummaryChunkEvent) => void): () => void
    /** 订阅完成事件 */
    onDone(cb: (event: SummaryDoneEvent) => void): () => void
    /** 订阅失败事件 */
    onError(cb: (event: SummaryErrorEvent) => void): () => void
  }
  export: {
    /** T54:导出某录音为 md / txt / srt(弹保存对话框);canceled=true 表示用户取消 */
    run(recordingId: string, format: ExportFormat): Promise<ExportRunResult>
  }
  audio: {
    /** capture window 订阅:main 发"启 capture"信令(T12) */
    onStartCapture(cb: (args: StartCaptureArgs) => void): () => void
    /** capture window 订阅:main 发"停 capture"信令(T12) */
    onStopCapture(cb: (args: StopCaptureArgs) => void): () => void
    /** capture window 上报 getUserMedia / getDisplayMedia 失败 */
    reportCaptureFailed(args: CaptureFailedArgs): void
  }
  // settings:T18 起补
}
