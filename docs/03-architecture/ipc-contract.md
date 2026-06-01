# IPC 协议

> **版本**：v0.1-draft
> **日期**：2026-05-16
> **状态**：03-architecture 阶段；与 [`overview.md`](./overview.md) §2 / 所有同级文档衔接
> **约束**：所有 IPC 消息字段在 04-development 启动前应已 freeze；新增 OK，破坏性修改要走 schemaVersion

---

## 0. 这份文档解决什么

把 main / renderer / utility 三个进程之间传的所有消息**集中列出来**，每条说明：通道、方向、payload、何时发、谁监听、错误形态。

**不解决**：业务逻辑（去对应的 audio-capture / transcription-pipeline / data-model）；TypeScript 类型在源码里维护（这里只贴 schema 草案）。

---

## 1. 总体约定

### 1.1 三种传输手段

| 手段                                                              | 用途                                                                  | 大致 throughput |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- | --------------- |
| `ipcMain.handle` + `ipcRenderer.invoke`（request/response）       | renderer 向主进程发命令拿结果，如"开始录音""设置 API key""列出录音库" | 慢，但语义清晰  |
| `webContents.send` + `ipcRenderer.on`（事件广播）                 | 主进程向 renderer 推状态更新，如"录音 tick""转录进度""下载进度"       | 中频            |
| **`MessageChannel` / `MessagePortMain`**（双向、含 transferable） | renderer ↔ main 高吞吐 PCM、main ↔ utility 转录控制                   | 高吞吐、零拷贝  |

### 1.2 通道命名

`{domain}:{verb}` 风格，全小写：

- `record:start` `record:stop` `record:tick`（录音域）
- `transcribe:start` `transcribe:progress`（转录域）
- `library:list` `library:meta-updated`（库域）
- `settings:get` `settings:set`
- `secrets:set` `secrets:test`
- `model:download:*`
- `summary:start` `summary:chunk` `summary:done`
- `system:*`（权限 / 自我状态查询）

### 1.3 payload 通用字段

每条 IPC 消息 payload 是一个 object（不传 positional）。可选公共字段：

```ts
type IpcEnvelope<T> = T & {
  ts?: number // 发送方 unix ms；仅事件类带，便于诊断
  trace?: string // 仅 debug 模式带的 uuid，跨进程串日志
}
```

### 1.4 错误返回

`invoke` 类调用 reject 时统一抛 `IpcError`：

```ts
type IpcError = Error & {
  code: string // 'permission-denied' | 'not-found' | 'invalid-state' | 'internal' | ...
  recoverable: boolean // UI 是否给"重试"按钮
  detail?: any
}
```

renderer 侧 wrapper 把 reject 转成 `{ ok: false, error }` 返回，方便上层 React 组件分支。

### 1.5 contextBridge 暴露

renderer 没有 `nodeIntegration`；preload 通过 `contextBridge.exposeInMainWorld('lazyaudio', api)` 暴露**白名单 API**。renderer 拿到的是：

```ts
window.lazyaudio = {
  record: { start, stop, pause, resume, subscribeTick, ... },
  library: { list, get, delete, rename, subscribeMeta, ... },
  transcribe: { retry, cancel, subscribeProgress, ... },
  summary: { run, retry, subscribeStream, ... },
  settings: { get, set, subscribe },
  secrets: { set, test, has },                       // 只能 set/test，无 get
  model: { listAvailable, listInstalled, download, cancelDownload, delete, ... },
  system: { permissions, openSettings, openInFolder, ... },
}
```

**renderer 永远拿不到**：文件绝对路径、API key、原生 handle、process 对象。

---

## 2. 录音域

### 2.1 命令（renderer → main）

| 通道                            | 方向   | payload                                                            | 返回                                     | 说明                                                                                                                                                                                                |
| ------------------------------- | ------ | ------------------------------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `record:get-prep-defaults`      | invoke | `{}`                                                               | `{ defaults: { sessionType, sources } }` | prep window renderer 拉默认值。**`title` 由 renderer 本地拼**（依赖当前时刻，main 在浮窗显示瞬间返回的 title 到用户回车之间会过几秒，体验上反而旧）                                                 |
| `record:start`                  | invoke | `{ sessionType, sources: { mic, system }, title }`                 | `{ recordingId, startedAt }`             | 主进程创建录音目录、开 writers、返回 id                                                                                                                                                             |
| `record:pause`                  | invoke | `{ recordingId }`                                                  | `{ ok: true }`                           |                                                                                                                                                                                                     |
| `record:resume`                 | invoke | `{ recordingId }`                                                  | `{ ok: true }`                           |                                                                                                                                                                                                     |
| `record:stop`                   | invoke | `{ recordingId }`                                                  | `{ ok: true }`                           | 不等 writer close 完，发后立即返回；后续靠事件感知                                                                                                                                                  |
| `record:request-system-sources` | invoke | `{}`                                                               | `{ sources: Array<{ id, name }> }`       | 主进程调 `desktopCapturer.getSources({ types: ['screen'] })`，传 id 给 renderer 喂 getUserMedia                                                                                                     |
| `record:report-warning`         | invoke | `{ recordingId, code: 'disk-slow'\|'pcm-dropouts'\|..., detail? }` | `{ ok }`                                 | renderer 检测到 PCM 丢帧 / writer ack 落后等 → 主进程汇总到 `meta.warnings` + 广播 `record:warning` 事件给所有窗口                                                                                  |
| `record:hide-prep`              | invoke | `{}`                                                               | `{ ok: true }`                           | prep 浮窗 renderer 主动通知 main 隐藏自己（取消按钮 / Esc / start 成功后）。**显示**仍由 main 自己触发（不走 IPC）；**blur 自动 hide** 也仍在 main 端独立工作（防止用户点别处时浮窗滞留）。T11 落地 |

> **prep window 是常驻隐藏的 BrowserWindow，组件实例只创建一次**：
>
> - **显示浮窗本身**是 main 内部动作（globalShortcut / Tray click 调 `showPrepWindow()`），不走 IPC
> - 首次 mount 时调用 `getPrepDefaults()` 拉一次
> - 后续订阅 `settings:changed` 事件，捕获 `recording.lastSessionType` / `recording.lastSourcesPerType` 变化更新本地 state——避免"第二次唤起浮窗仍是首次默认值"
> - `title` 字段在 renderer 内由 `Date.now()` + sessionType 中文名实时拼装；用户可编辑

> **`skipPrepPopover=true` 模式**：globalShortcut callback 不显示 prep window，直接由 main 用 `settings.recording.{lastSessionType, lastSourcesPerType}` 内部构造启动参数，**不**发 `record:start` IPC，而是直接调用 `orchestrator.start()`——与"prep renderer 发 record:start"复用同一个 entry point。title 同样在 main 内拼，避免双源。

### 2.2 事件（main → renderer）

| 通道             | payload                                                                                                            | 何时发                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| `record:state`   | `{ recordingId, status: 'idle'\|'preparing'\|'recording'\|'paused'\|'stopping'\|'done'\|'failed', failedReason? }` | 状态机迁移时              |
| `record:tick`    | `{ recordingId, durationMs }`                                                                                      | 录音中每 1s（不是 100ms） |
| `record:warning` | `{ recordingId, code: 'disk-slow'\|'pcm-dropouts'\|'permission-revoked-mid', detail? }`                            | 警告产生时                |

**不携带 levels**：电平表数据在 renderer 的 AudioWorklet 内同步计算（见 [`audio-capture.md`](./audio-capture.md) §3.3），直喂本地 React state，不走 IPC——避免 10 Hz round-trip + 主进程对 PCM-derived 数据的中转误用。`record:tick` 只承担"墙钟时长"的权威源职责（含 pause 校准），1 Hz 足够。

### 2.3 PCM 流（MessageChannel）

**单独一对 MessagePort，不走 ipcMain 通道**。

握手：

1. app 启动后主进程创建 `MessageChannelMain`，把 port2 通过 `webContents.postMessage('audio-port', null, [port])` 推给 prep / main renderer
2. renderer 在 preload 里接住，挂到 `window.__audioPort__`（仅 LazyAudio 内部用）

数据消息（renderer → main，through MessagePort）：

| `type`        | payload                                                                             |
| ------------- | ----------------------------------------------------------------------------------- |
| `track-open`  | `{ recordingId, trackId: 'mic'\|'system', sampleRate, channels, bitDepth }`         |
| `chunk`       | `{ recordingId, trackId, seq, pcm: ArrayBuffer }`（带 transferable）                |
| `track-close` | `{ recordingId, trackId, reason: 'normal'\|'permission-revoked'\|'error', error? }` |

反馈（main → renderer，through MessagePort）：

| `type`         | payload                                           |
| -------------- | ------------------------------------------------- |
| `writer-ack`   | `{ recordingId, trackId, lastSeq, bytesWritten }` |
| `writer-error` | `{ recordingId, trackId, code, message }`         |

详见 [`audio-capture.md`](./audio-capture.md) §4。

---

## 3. 转录域

### 3.1 命令（renderer → main）

| 通道                                 | payload                                         | 返回                                             | 说明                                                                                                                   |
| ------------------------------------ | ----------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `transcribe:retry`                   | `{ recordingId }`                               | `{ ok: true }`                                   | Pass B 状态=failed 时重新入队                                                                                          |
| `transcribe:cancel`                  | `{ recordingId }`                               | `{ ok: true }`                                   | 取消进行中 Pass B 任务（Pass A 由录音 stop 自动结束，不暴露独立 cancel）                                               |
| `transcribe:engine-test`             | `{ which: 'streaming' \| 'offline' \| 'both' }` | `{ streaming?: {ok, ...}, offline?: {ok, ...} }` | 设置页"测试连接"——对应 Pass A / B engine 各自 ping                                                                     |
| `transcribe:run-partial-offline`     | `{ recordingId, endSec }`                       | `{ ok: true }`                                   | F4.8 中途 Pass B：对 `[0, endSec]` 跑离线精修；要求 `endSec <= 当前 durationMs/1000 - 30`，否则 reject `invalid-state` |
| `transcribe:dismiss-partial-suggest` | `{ recordingId, snoozeMinutes: 10 }`            | `{ ok: true }`                                   | 用户点 banner "稍后"，下次 N 分钟后再提                                                                                |
| `transcribe:toggle-live`             | `{ enabled: boolean }`                          | `{ ok: true }`                                   | 设置中开关 Pass A；录音中切换立即生效（关：kill streaming utility；开：等下次录音 start）                              |

> 录音完成自动入队 Pass B；Pass A 由录音 start 自动 fork，不需要 renderer 显式发 `transcribe:start`。

### 3.2 事件（main → renderer）

| 通道                                 | payload                                                                                                                                          | 何时发                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `transcribe:queue`                   | `{ recordingId, position: number }`                                                                                                              | Pass B 入队时                                                                                                                |
| `transcribe:progress`                | `{ recordingId, pass: 'offline', phase: 'loading-model'\|'vad'\|'asr'\|'punct'\|'merging'\|'uploading'\|'waiting-api', processedMs?, totalMs? }` | Pass B utility / cloud upload 进度                                                                                           |
| `transcribe:live-progress`           | `{ recordingId, pass: 'live', processedMs, engineKind }`                                                                                         | Pass A 进度（streaming engine 上报，1 Hz）                                                                                   |
| `transcribe:live-segment`            | `{ recordingId, segment: TranscriptSegment }`                                                                                                    | Pass A 每出一段 hypothesis / confirmed 发一次；segment.stability 区分；segmentId 稳定，UI 据此原地替换                       |
| `transcribe:partial-offline-suggest` | `{ recordingId, durationMin: number, endSec: number }`                                                                                           | 录音满 10/20/30… 分钟 + 内存检测通过 → 发给主窗口显示 banner                                                                 |
| `transcribe:done`                    | `{ recordingId, segmentsCount, durationMs, mode: 'full' \| 'partial' }`                                                                          | Pass B transcript.json 已写盘；mode='partial' 时仅覆盖部分                                                                   |
| `transcribe:offline-overwrite`       | `{ recordingId, mode: 'full' \| 'partial', timeRangesCovered?: Array<{startSec, endSec}> }`                                                      | Pass B 完成、transcript.json 已覆盖 transcript.live.json 对应内容；renderer 用新 segments 整体刷新视图（不弹通知、不切视图） |
| `transcribe:failed`                  | `{ recordingId, pass: 'live' \| 'offline', code, message, recoverable }`                                                                         | 任一 pass 失败                                                                                                               |

### 3.3 utility ↔ main（仅主进程持有 port）

这一对消息不暴露到 renderer。

````ts
**Offline utility（Pass B）**：

```ts
// main → offline-utility
type OfflineAsrTask =
  | { type: 'init', platformDir }                // §3.2.1 必须第一条
  | { type: 'transcribe', taskId, recordingId, audioFiles: { mic?, system?, mixed? }, modelKey, language, timeRange? }
  | { type: 'cancel', taskId }
  | { type: 'ping' }
  | { type: 'unload-model' }
  | { type: 'reload-model', modelKey }

// offline-utility → main
type OfflineAsrEvent =
  | { type: 'progress', taskId, phase, processedMs }
  | { type: 'result', taskId, transcript: TranscriptResult }
  | { type: 'failed', taskId, code, message }
  | { type: 'log', level, message }
  | { type: 'pong' }
  | { type: 'ready' }
````

**Streaming utility（Pass A，Multi Pass 新增）**：

```ts
// main → streaming-utility
type StreamingAsrTask =
  | { type: 'init'; platformDir; modelKey; language } // 启动时一次，加载 streaming 模型
  | { type: 'pcm'; recordingId; int16: Int16Array } // 16k mono Int16 PCM 块（transferable）
  // main 已 downmix；frequency ~10Hz
  | { type: 'stop'; recordingId } // 录音 stop → engine 内部 flush 最后段 → 退出
  | { type: 'ping' }

// streaming-utility → main
type StreamingAsrEvent =
  | { type: 'segment'; recordingId; segment: TranscriptSegment } // hypothesis 或 confirmed
  | { type: 'progress'; recordingId; processedMs }
  | { type: 'failed'; code; message } // 致命错（模型加载等）→ main fallback 标 disabled
  | { type: 'flushed'; recordingId } // 收到 stop 后 flush 完毕，准备退出
  | { type: 'log'; level; message }
  | { type: 'pong' }
  | { type: 'ready' }
```

主进程对 utility 做健康检查：每 30s `ping`，2 次无 `pong` 则视为僵死，kill + 重启（最多 3 次连续重启）。

---

## 4. 模型下载域

### 4.1 命令（renderer → main）

| 通道                    | payload        | 返回                                                                                    |
| ----------------------- | -------------- | --------------------------------------------------------------------------------------- |
| `model:list-available`  | `{}`           | `{ models: ModelEntry[] }`（从 app 内置 registry）                                      |
| `model:list-installed`  | `{}`           | `{ models: Array<{ modelKey, downloadedAt, bytesTotal, source }> }`（从 manifest.json） |
| `model:download`        | `{ modelKey }` | `{ ok: true }`（立即返回，进度走事件）                                                  |
| `model:cancel-download` | `{ modelKey }` | `{ ok: true }`                                                                          |
| `model:delete`          | `{ modelKey }` | `{ ok: true }`                                                                          |
| `model:reverify`        | `{ modelKey }` | `{ ok, mismatch?: string[] }`（全量 SHA256，慢）                                        |

### 4.2 事件（main → renderer）

| 通道                             | payload                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| `model:download:start`           | `{ modelKey, totalBytes, source }`                                                         |
| `model:download:progress`        | `{ modelKey, downloadedBytes, totalBytes, bytesPerSec, etaMs }`                            |
| `model:download:source-switched` | `{ modelKey, from, to, reason }`                                                           |
| `model:download:done`            | `{ modelKey, durationMs }`                                                                 |
| `model:download:cancelled`       | `{ modelKey }`                                                                             |
| `model:download:failed`          | `{ modelKey, code: 'all-sources-failed'\|'checksum-mismatch'\|'disk-full'\|..., message }` |

---

## 5. 摘要域

### 5.1 命令（renderer → main）

| 通道                      | payload                                | 返回                                                             |
| ------------------------- | -------------------------------------- | ---------------------------------------------------------------- |
| `summary:generate`        | `{ recordingId, templateId?: string }` | `{ ok: true }`（流走事件）                                       |
| `summary:cancel`          | `{ recordingId }`                      | `{ ok: true }`                                                   |
| `summary:get`             | `{ recordingId }`                      | `{ status, text, templateId?, model?, error? }`                  |
| `summary:test-connection` | `{}`                                   | `{ ok, error? }`                                                 |
| `summary:list-templates`  | `{}`                                   | `{ templates: Template[], templatePerSessionType }`（含 prompt） |
| `summary:set-template`    | `{ id, systemPrompt, sessionTypes }`   | `{ ok: true, template: Template }`（保存内置模板的用户覆盖）     |
| `summary:reset-template`  | `{ id }`                               | `{ ok: true, template: Template }`（清掉该模板覆盖和相关映射）   |

### 5.2 事件（main → renderer）

| 通道             | payload                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| `summary:start`  | `{ recordingId, templateId, model }`                                                                    |
| `summary:chunk`  | `{ recordingId, delta: string }`（SSE 流式增量）                                                        |
| `summary:done`   | `{ recordingId, charCount }`                                                                            |
| `summary:failed` | `{ recordingId, code: 'auth'\|'rate-limit'\|'context-overflow'\|'network'\|..., message, recoverable }` |

---

## 6. 录音库域

### 6.1 命令

| 通道                        | payload                                                    | 返回                                                                                                                 |
| --------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `library:list`              | `{ filter?: { sessionType?, dateRange? } }`                | `{ entries: LibraryEntry[] }`（从内存 index）                                                                        |
| `library:get`               | `{ recordingId }`                                          | `{ meta: RecordingMeta, transcript?: Transcript, summary?: string }`                                                 |
| `library:search`            | `{ query: string, scope: 'title'\|'preview'\|'fulltext' }` | `{ hits: Array<{ recordingId, where: 'title'\|'preview'\|'transcript', snippet?: string, segmentIndex?: number }> }` |
| `library:rename`            | `{ recordingId, title }`                                   | `{ ok }`                                                                                                             |
| `library:delete`            | `{ recordingId, confirm: true }`                           | `{ ok }`                                                                                                             |
| `library:show-in-folder`    | `{ recordingId }`                                          | `{ ok }`（主进程调 `shell.showItemInFolder`）                                                                        |
| `library:export-transcript` | `{ recordingId, format: 'md'\|'txt'\|'srt', destPath? }`   | `{ destPath }`（弹保存对话框时由主进程提供）                                                                         |
| `library:rebuild-index`     | `{}`                                                       | `{ entries: number, durationMs }`                                                                                    |

`library:get` 返回 transcript 时不带字级 tokens（节省 IPC），需要时单独取 `library:get-transcript-tokens`。

### 6.2 事件

| 通道                    | payload                                           | 何时发             |
| ----------------------- | ------------------------------------------------- | ------------------ |
| `library:meta-updated`  | `{ recordingId, fields: Partial<RecordingMeta> }` | 任一 meta 字段变化 |
| `library:entry-added`   | `{ entry: LibraryEntry }`                         | 新录音创建         |
| `library:entry-removed` | `{ recordingId }`                                 | 用户删除           |

---

## 7. 设置 & Secrets

### 7.1 设置（明文）

| 通道                       | payload                        | 返回                                               |
| -------------------------- | ------------------------------ | -------------------------------------------------- |
| `settings:get`             | `{}`                           | `{ settings: Settings }`                           |
| `settings:set`             | `{ patch: Partial<Settings> }` | `{ settings: Settings }`（返回合并后全量）         |
| `settings:reset`           | `{ section?: keyof Settings }` | `{ settings: Settings }`                           |
| `settings:choose-save-dir` | `{}`                           | `{ path?: string }`（弹原生目录选择对话框）        |
| `settings:choose-shortcut` | `{ accelerator: string }`      | `{ ok: true, conflict?: { description: string } }` |

事件：

| 通道               | payload                        |
| ------------------ | ------------------------------ |
| `settings:changed` | `{ patch: Partial<Settings> }` |

### 7.2 Secrets（不返回明文）

| 通道            | payload                                                     | 返回                                                                 |
| --------------- | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| `secrets:has`   | `{ service: 'cloudTranscribe'\|'cloudLLM'\|'modelMirror' }` | `{ has: boolean }`                                                   |
| `secrets:set`   | `{ service, value: string }`                                | `{ ok: true }`                                                       |
| `secrets:clear` | `{ service }`                                               | `{ ok: true }`                                                       |
| `secrets:test`  | `{ service, baseUrl, model? }`                              | `{ ok, latencyMs?, error? }`（用主进程当前 key + 临时配置发起 ping） |

`secrets:test` 用现有 key + 传入 baseUrl/model 做一次连通测试——给"在设置里改 URL 后立即试"的体验。

**ping 方法选择**（每个 service 不同）：

| service           | 优先方法                                                        | 回退                                                          |
| ----------------- | --------------------------------------------------------------- | ------------------------------------------------------------- |
| `cloudLLM`        | `GET {baseUrl}/models`（OpenAI/DeepSeek/Groq 都支持，无副作用） | `POST {baseUrl}/chat/completions` 用 `max_tokens: 1` 最小请求 |
| `cloudTranscribe` | `GET {baseUrl}/models`                                          | `POST {baseUrl}/audio/transcriptions` 上传一段 1s 静音 wav    |
| `modelMirror`     | `HEAD {sourceUrl}/{sample-file}`                                | —                                                             |

GET /models 失败但不是 4xx（如 405 Method Not Allowed）才走 POST 回退；4xx 直接报 auth/config 错。

---

## 8. 系统 / 权限

| 通道                          | payload                                                                                                      | 返回                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `system:permissions`          | `{}`                                                                                                         | `{ microphone: 'granted'\|'denied'\|'not-determined', accessibility: 'granted'\|'denied'\|'unknown' }` |
| `system:open-system-settings` | `{ kind: 'microphone'\|'accessibility'\|'shortcut' }`                                                        | `{ ok }`                                                                                               |
| `system:open-in-folder`       | `{ kind: 'recordings'\|'logs'\|'models' }`                                                                   | `{ ok }`                                                                                               |
| `system:app-version`          | `{}`                                                                                                         | `{ version, electron, node, platform, arch }`                                                          |
| `system:open-external`        | `{ url }`                                                                                                    | `{ ok }`（仅允许 `https://` 且 host 命中白名单，否则 reject `code: 'host-not-allowed'`）               |
| `system:notify`               | `{ title, body, clickAction?: { kind: 'open-recording'\|'open-settings'\|'open-onboarding', id?: string } }` | `{ ok }`（主进程 `new Notification`；click 后主进程 dispatch 对应 IPC）                                |

**`system:open-external` host 白名单匹配规则**：

- 完整 host 等值匹配：`github.com` / `hf-mirror.com` / `huggingface.co` / `modelscope.cn` / `k2-fsa.github.io`
- suffix 匹配（带前缀 `.`）：`.huggingface.co`（允许 `cdn.huggingface.co` 等子域）
- 用户在 `settings.cloudTranscribe.apiBaseUrl` / `cloudLLM.apiBaseUrl` 配置的 host 动态加入白名单（运行时拼装）

不允许任意 URL，避免 renderer XSS 后跳钓鱼站。

---

## 9. Onboarding

Onboarding 大部分 IPC 复用 settings / model / secrets / system，只新增几个流程性的：

| 通道                  | payload            | 返回                                           |
| --------------------- | ------------------ | ---------------------------------------------- |
| `onboarding:status`   | `{}`               | `{ done: boolean, step?: string }`             |
| `onboarding:complete` | `{}`               | `{ ok }`（写 settings.onboarding.completedAt） |
| `onboarding:skip-to`  | `{ step: string }` | `{ ok }`                                       |

---

## 10. preload 暴露的 API（renderer 看到的形态）

```ts
// electron/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'

const invoke = <T = any>(ch: string, p?: any): Promise<T> => ipcRenderer.invoke(ch, p)
const subscribe = (ch: string, cb: (...a: any[]) => void) => {
  const handler = (_e: any, ...a: any[]) => cb(...a)
  ipcRenderer.on(ch, handler)
  return () => ipcRenderer.off(ch, handler)
}

contextBridge.exposeInMainWorld('lazyaudio', {
  record: {
    getPrepDefaults: () => invoke('record:get-prep-defaults'),
    start: (opts) => invoke('record:start', opts),
    stop: (recordingId) => invoke('record:stop', { recordingId }),
    pause: (recordingId) => invoke('record:pause', { recordingId }),
    resume: (recordingId) => invoke('record:resume', { recordingId }),
    requestSystemSources: () => invoke('record:request-system-sources'),
    hidePrep: () => invoke('record:hide-prep'),
    onState: (cb) => subscribe('record:state', cb),
    onTick: (cb) => subscribe('record:tick', cb),
    onWarning: (cb) => subscribe('record:warning', cb),
  },
  transcribe: {
    retry: (recordingId) => invoke('transcribe:retry', { recordingId }),
    cancel: (recordingId) => invoke('transcribe:cancel', { recordingId }),
    engineTest: () => invoke('transcribe:engine-test'),
    onQueue: (cb) => subscribe('transcribe:queue', cb),
    onProgress: (cb) => subscribe('transcribe:progress', cb),
    onDone: (cb) => subscribe('transcribe:done', cb),
    onFailed: (cb) => subscribe('transcribe:failed', cb),
  },
  // ... summary / library / model / settings / secrets / system / onboarding 同构
})
```

renderer 侧用 React hook 封装：

```ts
function useRecordTick(recordingId?: string) {
  const [tick, setTick] = useState<{ durationMs: number } | null>(null)
  useEffect(() => {
    if (!recordingId) return
    return window.lazyaudio.record.onTick((t) => {
      if (t.recordingId === recordingId) setTick({ durationMs: t.durationMs })
    })
  }, [recordingId])
  return tick
}
// 电平表用单独的 hook，订阅 worklet 的 message port（不经主进程）：
// useLevels(recordingId) → { mic: 0~1, system: 0~1 }
```

---

## 11. Schema 校验

每条 IPC 命令在主进程入口做运行时校验，避免 renderer 被 XSS 注入后传脏数据：

```ts
import { z } from 'zod'

const recordStartSchema = z.object({
  sessionType: z.enum(['general', 'meeting', 'note' /* ... */]),
  sources: z.object({ mic: z.boolean(), system: z.boolean() }),
  title: z.string().min(1).max(200),
})

ipcMain.handle('record:start', async (_e, raw) => {
  const opts = recordStartSchema.parse(raw) // 不通过抛 ZodError
  return recordOrchestrator.start(opts)
})
```

事件方向（main → renderer）**不**做校验——主进程是可信源，renderer 拿到非法数据是 main 的 bug，不是攻击面。

校验失败的 IpcError：

```ts
{ code: 'invalid-payload', recoverable: false, detail: zodError.issues }
```

---

## 12. 性能与背压

| 通道                      | 频率上限                  | 处理                                                                 |
| ------------------------- | ------------------------- | -------------------------------------------------------------------- |
| `record:tick`             | 1 Hz                      | 主进程 throttle 到 1 Hz；电平表 renderer worklet 直算给 UI，不发 IPC |
| `transcribe:progress`     | 5 Hz                      | utility 内部 throttle                                                |
| `summary:chunk`           | LLM 输出节奏（~10–30 Hz） | 主进程 buffer 100 ms 合并后转发 renderer，减少 ipcRenderer 调度压力  |
| `model:download:progress` | 5 Hz                      | 下载器 throttle                                                      |
| `library:meta-updated`    | 写 meta 时（≤ 1 Hz 常态） | 不限频，本来就少                                                     |
| PCM chunk (MessagePort)   | 10 Hz × 2 路              | transferable，零拷贝，详见 audio-capture §4.3                        |

renderer 侧任何"高频订阅"在组件 unmount 时必须解绑（subscribe 返回的 unsubscribe）。

---

## 13. 错误编码表（不完全列举）

| code                 | 出现位置                                       | 含义                                         |
| -------------------- | ---------------------------------------------- | -------------------------------------------- |
| `invalid-payload`    | 任何 invoke 入口                               | schema 校验失败                              |
| `invalid-state`      | record:start 在已录制中、library:delete 不存在 | 状态机不允许                                 |
| `permission-denied`  | record:start 麦克风没权限                      | 引导用户开系统设置                           |
| `not-found`          | library:get / model:download 用了不存在的 id   |                                              |
| `internal`           | 未分类的主进程异常                             | 用户看到"应用内部错误，请重试"+ 上报日志按钮 |
| `auth`               | secrets:test / summary / cloud transcribe      | API key 错                                   |
| `rate-limit`         | cloud API                                      | 429                                          |
| `context-overflow`   | summary                                        | 算 token 超模型 contextWindow                |
| `all-sources-failed` | model:download                                 | 镜像都挂                                     |
| `checksum-mismatch`  | model:download                                 | SHA 不对                                     |
| `disk-full`          | record / model                                 | 磁盘空间 < 阈值                              |
| `engine-unavailable` | transcribe / summary                           | 本地引擎加载失败，云端未配                   |

文案统一在 renderer 侧 i18n 表里维护（react-i18next，详见 [`overview.md`](./overview.md) §6.4），`errors.json` 把 IPC error code 映射到用户可读文案。

---

## 14. 与 schemaVersion 的关系

IPC 协议本身不带 schemaVersion（每个 release 跟 app 版本走，不存在跨版本通信）。但 payload 里**引用持久化对象**的字段会带 schemaVersion 透出（如 `library:get` 返回的 `RecordingMeta` 自带 `schemaVersion: 1`），renderer 据此判断是否需要 graceful degrade。

---

## 15. 开放问题

- **PCM MessagePort 是否每次录音重建一次**：建链一次复用整个 app 生命周期更省；但 recordingId 串到所有 chunk 上既能复用又能区分，方向取后者。
- **transcribe:progress 给百分比还是阶段**：UI 想给进度条但本地转录 RTF 估算误差不小。倾向"阶段 + processedMs / totalMs"，让 renderer 自己算 pct。
- **summary:chunk 是否要按句切**：现在按 SSE delta 透传，UI 可能渲染半个字。设 buffer = 100ms 内合并基本能让中文按字成型，足够。
- **renderer 间通信**：onboarding 和 main window 之间要不要直接 message？v0.1 不需要——所有跨窗口状态走 main 中转。

---

## 16. 跨文档导航

| 想了解                                     | 看                                                              |
| ------------------------------------------ | --------------------------------------------------------------- |
| 录音状态机、PCM 流细节                     | [`audio-capture.md`](./audio-capture.md)                        |
| meta / transcript / settings 字段全集      | [`data-model.md`](./data-model.md)                              |
| utility process 的 AsrTask / AsrEvent 用法 | [`transcription-pipeline.md`](./transcription-pipeline.md) §3.6 |
| 进程拓扑全景                               | [`overview.md`](./overview.md) §2                               |
