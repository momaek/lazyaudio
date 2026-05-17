# 数据模型与存储

> **版本**：v0.1-draft
> **日期**：2026-05-16
> **状态**：03-architecture 阶段；与 [`overview.md`](./overview.md) §5 / [`audio-capture.md`](./audio-capture.md) §5 衔接
> **依赖**：PRD §6 已经给出 v1.0 的字段，本文档负责把字段定型 + 加版本化 + 想清楚边界情况

---

## 0. 这份文档解决什么

`overview.md` 给了目录树，PRD §6 给了核心字段，但还有以下问题没回答：

- 字段的精确类型、默认值、可选 / 必选
- schema 版本怎么走、未来字段迁移怎么办
- 录音库怎么索引（每次扫盘 vs 维护 index.json）
- 文件写入的原子性（写 meta 时崩溃怎么办）
- 设置里的敏感字段（API key）跟普通字段怎么分家
- 跨进程读 / 写同一份 meta 的同步

**不解决**：音频文件格式（[`audio-capture.md`](./audio-capture.md) §5.2 已说）、transcript 内容的转录逻辑（在 [`transcription-pipeline.md`](./transcription-pipeline.md)）、字段在 IPC 中的传输格式（在 [`ipc-contract.md`](./ipc-contract.md)）。

---

## 1. 目录布局

```
{userData}/LazyAudio/                       # macOS: ~/Library/Application Support/LazyAudio/
│                                            # Windows: %APPDATA%\LazyAudio\
├── settings.json                            # 应用设置（不含 secrets）
├── library/
│   └── index.json                           # 录音库索引（§5）
├── recordings/
│   └── {recordingId}/                       # 一次录音 = 一个目录
│       ├── meta.json
│       ├── mic.wav                          # 可选（用户关分轨则无 / 混音后删）
│       ├── system.wav                       # 同上
│       ├── mixed.wav                        # 始终生成（除非合成失败）
│       ├── transcript.live.json             # Pass A 实时转录（录音中增量写入；Pass B 完成后仍保留供对比 / 调试）
│       ├── transcript.json                  # Pass B 离线高精度转录；UI 默认读这份，缺则回退 transcript.live.json
│       └── summary.md                       # LLM 摘要（基于 transcript.json）
├── templates/
│   ├── builtin/                             # 内置模板（只读，跟 app 发版）
│   │   ├── meeting.json
│   │   ├── note.json
│   │   ├── interview-as-interviewer.json
│   │   ├── interview-as-candidate.json
│   │   └── lecture.json
│   └── user/                                # 用户自定义模板（可写）
│       └── *.json
├── models/
│   ├── manifest.json                        # 已下载模型清单 + 校验信息
│   └── {modelKey}/                          # 一个 modelKey = sherpa-onnx 一组文件
│       ├── model.onnx
│       ├── tokens.txt
│       └── ...                              # VAD / 标点模型同结构
└── logs/
    ├── main.log                             # 主进程日志（rotate）
    └── asr.log                              # utility process 日志
```

Secrets（API key 等）**不在文件系统**——见 §3.2。

### 1.1 路径解析

| 标识         | macOS                            | Windows                      |
| ------------ | -------------------------------- | ---------------------------- |
| `{userData}` | `~/Library/Application Support/` | `%APPDATA%\`                 |
| `{logs}`     | `~/Library/Logs/LazyAudio/`      | `{userData}\LazyAudio\logs\` |

主进程通过 `app.getPath('userData')` 拿基址；renderer 只通过 IPC 访问，**不直接拿到绝对路径**（避免泄露用户主目录到 console / 日志）。

### 1.2 录音目录命名

```
recordings/{recordingId}/
```

其中 `recordingId` 是 **ULID**（26 字符），不是时间戳字符串。理由：

- 时间戳字符串（如 `2026-05-16T14-30-00_meeting`）作为目录名好处是直观，但有冲突：1 分钟内连按两次快捷键就需要后缀（`_1`/`_2`），处理麻烦
- ULID 自带时间前缀（前 10 字符）+ 单调递增，按目录名排序 = 按创建时间排序
- 唯一，跨设备同步（v0.2+）不撞

显示给用户的是 `meta.title`，目录名是内部 id。

---

## 2. 录音元数据：meta.json

每次录音一份，**录音过程中边录边更新**。

### 2.1 Schema v1

```ts
// recordings/{recordingId}/meta.json
type RecordingMeta = {
  // —— 版本与身份 ——
  schemaVersion: 1 // 数字，破坏性改动时 +1
  id: string // ULID，与目录名一致
  appVersion: string // 创建时的 app 版本，"0.1.0"

  // —— 用户字段 ——
  title: string // 默认 "{sessionType 中文名} {YYYY-MM-DD HH:mm}"
  sessionType: SessionType

  // —— 设备身份（v0.x sync 用） ——
  createdBy: string // installId，写入时填，永不改

  // —— 录音事实 ——
  startedAt: number // unix ms，墙钟时间
  endedAt?: number // unix ms，stop 之后写
  durationMs: number // 实际有效录音时长（不含 pause）
  wallClockMs?: number // endedAt - startedAt（含 pause）
  sources: {
    mic: boolean
    system: boolean
  }
  pauseSegments?: Array<{ startMs: number; endMs: number }> // 见 audio-capture §8.1

  // —— 文件 ——
  audioFiles: {
    mic?: {
      path: 'mic.wav'
      codec: 'wav-pcm-s16le'
      sampleRate: 48000
      channels: 1
      bitDepth: 16
      bytes: number
    }
    system?: {
      path: 'system.wav'
      codec: 'wav-pcm-s16le'
      sampleRate: 48000
      channels: 2
      bitDepth: 16
      bytes: number
    }
    mixed?: {
      path: 'mixed.wav'
      codec: 'wav-pcm-s16le'
      sampleRate: 48000
      channels: 2
      bitDepth: 16
      bytes: number
    }
  } // codec 字段 v0.1 唯一取值 'wav-pcm-s16le'；预留 v0.2 'opus'/'aac' 压缩

  // —— 状态机（录音 / 混音 / 转录 / 摘要 四套子状态） ——
  status: 'recording' | 'stopping' | 'done' | 'failed' | 'recovered'
  failedReason?: string // status=failed 时填
  mixStatus: 'pending' | 'running' | 'done' | 'failed' | 'skipped'

  // Multi Pass：Pass A（实时）与 Pass B（离线）独立状态
  liveTranscribe: {
    status: 'idle' | 'running' | 'done' | 'failed' | 'disabled' // disabled = 用户在设置关 Pass A
    engine?: 'local-streaming-zipformer' | 'local-vad-shortwin' | 'cloud-openai-stream'
    modelKey?: string
    startedAt?: number
    endedAt?: number // 录音 stop 时
    lastSegmentAt?: number // 最后一个 confirmed 段写入时间，崩溃恢复参考
    segmentCount?: number
    error?: string
  }
  transcribe: {
    // 仍指 Pass B（离线）
    status: 'idle' | 'pending' | 'running' | 'done' | 'failed'
    mode?: 'full' | 'partial' // partial = F4.8 中途增量
    engine?: 'local-sense-voice' | 'openai-compatible'
    modelKey?: string // 本地模式：'sense-voice-zh-en-ja-ko-yue-2025-09-09-int8'
    apiBaseUrl?: string // 云端模式：脱敏存（host only）
    startedAt?: number
    endedAt?: number
    timeRangesProcessed?: Array<{ startSec; endSec }> // 增量模式累积；full 模式只一条 [0, durationSec]
    error?: string
  }
  summary: {
    status: 'idle' | 'pending' | 'running' | 'done' | 'failed'
    template?: string // 用了哪个模板的 id
    model?: string // 'gpt-4o-mini' 等
    apiBaseUrl?: string // 脱敏 host only
    startedAt?: number
    endedAt?: number
    error?: string
  }

  // —— 警告与诊断（非致命，不阻塞流程） ——
  warnings?: Array<{
    code: 'pcm-dropouts' | 'mix-failed' | 'permission-revoked-mid' | 'disk-slow' | string
    at: number // unix ms
    detail?: unknown // consumer 负责 narrow
  }>
}

type SessionType =
  | 'general'
  | 'meeting'
  | 'note'
  | 'interview-as-interviewer'
  | 'interview-as-candidate'
  | 'lecture'
  | 'podcast'
```

### 2.2 字段决定

| 字段                                                   | 为什么这么定                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `schemaVersion` 数字而非字符串                         | 比较 `< 2` 比 semver 解析简单；JSON 文件没必要走 semver                                                 |
| `id` 与目录名重复                                      | 防止目录改名导致 id 丢失；扫盘时只读 `id` 不读目录名                                                    |
| `appVersion`                                           | 字段缺失 / 异常时方便定位是哪个版本写的                                                                 |
| `durationMs` vs `wallClockMs` 分开                     | UI 列表显示有效录音时长（PRD §4 F2.2 / F5.3），调试用墙钟                                               |
| `audioFiles.bytes` 冗余存                              | 库扫描时不用 stat 每个文件，索引快很多                                                                  |
| 4 套子状态分开（录音 / 混音 / 转录 / 摘要）            | 任一失败不阻塞其它；UI 上能分别显示进度（PRD §5.2 时序图就是这么走的）                                  |
| `apiBaseUrl` 存完整 host（含 port），不存 path / query | 完整 URL 可能带 token query 参数；meta 里仅 `https://host:port` 已够追溯；日志再做 hash 脱敏（见 §8.3） |
| `warnings` 数组而非 single field                       | 一次录音可能多个轻警告（如 pcm dropouts + mix failed）                                                  |

### 2.3 写入时机

```
status        触发点                                   写入字段
─────────────────────────────────────────────────────────────────
recording     第一帧 PCM 到达                          全部字段，audioFiles 暂用预期值
recording     每 30 秒                                 durationMs, audioFiles.*.bytes
stopping      用户按 stop                              endedAt, wallClockMs, status, pauseSegments
done          writers close 完                         status, audioFiles 精确大小
done          mix 完                                   mixStatus, audioFiles.mixed
done          transcribe / summary 完                  对应子状态字段
```

### 2.4 原子写

meta.json 频繁更新，不允许"写到一半进程崩溃留下半截 JSON":

```ts
// 主进程 src/electron/main/library/atomicWrite.ts
async function atomicWriteJSON(path: string, obj: any) {
  const tmp = path + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(obj, null, 2))
  await fs.rename(tmp, path) // POSIX 原子；Windows NTFS 也原子
}
```

- 永远写完 `.tmp` 再 rename
- rename 失败留下 `.tmp`：启动恢复时检测到 `meta.json.tmp` 且 `meta.json` 不存在则提升（罕见，仅首帧 PCM 与第一次写 meta 之间崩溃才会撞上）

### 2.5 并发读 / 写

唯一写者是**主进程**——renderer / utility 都不直接写文件。renderer 通过 IPC 拿到内存中的 meta 快照；订阅 `library:meta-updated` 事件刷新。

utility process 把"转录进度 / 段落"通过 message 回主进程，主进程负责更新 meta + 写盘。

不需要文件锁。

---

## 3. 应用设置：settings.json + keychain

### 3.1 settings.json（不含 secrets）

```ts
type Settings = {
  schemaVersion: 1

  // —— 设备身份 ——
  installId: string // 首次启动时生成的 UUID，永不改；v0.x sync 用作冲突解决基础

  // —— 隐私模式 & 转录 ——
  privacyMode: 'local' | 'cloud'
  localModel: {
    modelKey: string // 默认 'sense-voice-zh-en-ja-ko-yue-2025-09-09-int8'
    autoDownload: boolean // onboarding 后允许后台自动补漏
  }
  cloudTranscribe?: {
    enabled: boolean
    apiBaseUrl: string // 完整 URL（除 key 之外）
    model: string // 用户填的 model 名
    // apiKey 不在这里，见 §3.2
  }
  cloudLLM?: {
    apiBaseUrl: string
    model: string
    contextWindow?: number // tokens 上限，默认 128_000；MapReduce 切片判据（transcription-pipeline §6.4）
    // apiKey 见 §3.2
  }

  // —— 录音 ——
  recording: {
    saveDir: string // 默认 {userData}/LazyAudio/recordings
    keepTracks: boolean // F3.1 分轨是否保留，默认 true
    defaultSessionType: SessionType // 兜底默认（用户从未录过）：'general'
    lastSessionType?: SessionType // F1.1 "上次选择"——浮窗默认 = lastSessionType ?? defaultSessionType
    lastSourcesPerType: Partial<Record<SessionType, { mic: boolean; system: boolean }>>
    autoTranscribe: boolean // F4.1 默认 true
    autoSummaryAfterTranscribe: boolean // 默认 true（若 LLM 配置完整）
    skipPrepPopover: boolean // PRD §5.2 选项：跳过录前浮窗
    complianceTipDismissed: boolean // F6.5
    templatePerSessionType?: Partial<Record<SessionType, string>> // sessionType → templateId 用户偏好；缺失则走内置默认（transcription-pipeline §6.2）
  }

  // —— Onboarding 状态 ——
  onboarding: {
    completedAt?: number // 完成时间戳；缺失即未完成
    step?: OnboardingStep // 中途退出时停留的步骤 id，重启后续从此恢复
  }

  // —— 快捷键 ——
  shortcuts: {
    recordToggle: string // 'CommandOrControl+Shift+R'
  }

  // —— UI ——
  ui: {
    theme: 'system' | 'light' | 'dark'
    language: 'zh-CN' | 'en' // v0.1 仅 zh-CN，预留字段
    mainWindowBounds?: { x; y; width; height }
  }

  // —— 模型下载源（PRD §11） ——
  modelDownload: {
    sourceOrder: Array<'hf-mirror' | 'modelscope' | 'github-releases'>
  }

  // —— 诊断 ——
  diagnostics: {
    logLevel: 'info' | 'debug'
    crashReport: boolean // v0.1 始终 false
  }
}

type OnboardingStep =
  | 'version-check' // 屏 0：macOS 版本兼容性
  | 'welcome'
  | 'privacy' // 隐私模式选择
  | 'permission' // 权限引导（麦克风 / Accessibility）
  | 'model-download' // 本地模式：模型下载
  | 'api-config' // 云端模式：API key 配置
  | 'shortcut' // 快捷键确认
  | 'compliance' // 录音合规提示
  | 'done'
```

### 3.2 Secrets：safeStorage 加密落盘，不进 settings.json

**选型**：用 Electron 内置 `safeStorage`（≥ Electron 15），不引 `keytar`：

| 选项                    | 决定 | 理由                                                                     |
| ----------------------- | ---- | ------------------------------------------------------------------------ |
| `keytar`                | ❌   | Atom 退役后无人维护；带 native 依赖增加签名复杂度                        |
| `safeStorage`           | ✅   | 内置、零 native 依赖；macOS 走 Keychain encryption key、Windows 走 DPAPI |
| 自己 AES + 盘内 keyfile | ❌   | 重复造轮子，密钥保护强度低于 `safeStorage`                               |

**非保证项 / 用户可见性**：

- macOS：`safeStorage` 会在 Keychain.app 里创建一个 `LazyAudio Safe Storage` 条目——这是保护**对称加密 key** 的，**不**是实际的 API key
- 用户能从系统钥匙串看到这个保护密钥的条目，但**无法**直接拷贝实际 API key（API key 是用该密钥加密后存在 `secrets.dat` 文件里的 blob）
- 用户要修改 / 撤销 API key 只能从 LazyAudio 设置页操作；这一约束需要在"关于"页 / 设置帮助文案明说
- Windows：DPAPI 加密，凭据管理器里**不**显示 LazyAudio 条目（DPAPI 用 user profile key，无 keychain entry）

**落盘位置**：`{userData}/LazyAudio/secrets.dat`（单文件，整体加密的 JSON）：

```ts
// 解密后的内存结构
type SecretsBundle = {
  schemaVersion: 1
  cloudTranscribe?: { apiKey: string }
  cloudLLM?: { apiKey: string }
  modelMirror?: { hfToken?: string } // 企业镜像可能要
}
```

**主进程是唯一访问者**。renderer 想用：

- 设置页填 key → IPC `secrets:set { service, value }` → 主进程 `safeStorage.encryptString` → atomic write `secrets.dat`
- renderer **永远拿不到** key 明文；要测试连通性，调 `secrets:test` 让主进程发起请求

**`safeStorage.isEncryptionAvailable()` 为 false 的兜底**：
极少数 Linux 桌面环境会返回 false（缺 keyring）。v0.1 不支持 Linux，但若 macOS / Windows 上出现（异常 OS 状态），UI 退化为"会话级别保存 key"——不落盘、内存里用，重启需重填——并 toast 警告。

### 3.3 设置写入

settings.json 用 §2.4 同样的 atomic write。频率低（用户改设置时才写），不需要批合并。

### 3.4 设置迁移

未来字段增删走 `schemaVersion` 比较：

```ts
function migrate(raw: any): Settings {
  let s = raw
  if (s.schemaVersion === undefined) s = migrate_0_to_1(s)
  // if (s.schemaVersion === 1) s = migrate_1_to_2(s)
  return s
}
```

v0.1 还没有历史包袱，写好 migrate 入口即可，第一次破坏性改动时再写具体迁移函数。

---

## 4. 转录文本：transcript.json

### 4.1 Schema

```ts
// recordings/{recordingId}/transcript.json
type Transcript = {
  schemaVersion: 1
  recordingId: string // 与目录名一致；防止 transcript 移走后无法关联
  pass: 'live' | 'offline' // Multi Pass 区分；transcript.live.json='live'，transcript.json='offline'

  engine: string // 'local-streaming-zipformer' | 'local-vad-shortwin' | 'cloud-openai-stream'（live）
  // 'local-sense-voice' | 'openai-compatible'（offline）
  modelKey?: string // 本地
  modelName?: string // 云端 api 返回的 model
  language: string // 'zh' | 'en' | 'auto' | ISO 语言码

  generatedAt: number // unix ms（live: 最后写入时刻；offline: 全部完成时刻）
  durationMs: number // 转录耗时（offline: 一次性总耗时；live: 累计实时 ASR 占用时长）

  segments: TranscriptSegment[] // live: stability 字段混合；offline: 全部 'confirmed'
  partial?: boolean // live: 录音中持续写入时 true，录音 stop 时刷为 false
  // offline: 增量模式（F4.8）时 true 且 timeRangesCovered 标记覆盖范围
  timeRangesCovered?: Array<{ startSec; endSec }> // partial=true 时必填；UI 据此判断哪些段落是 Pass B 已覆盖
}

type TranscriptSegment = {
  // —— 身份（Multi Pass 必备） ——
  segmentId: string // 稳定 id，hypothesis → confirmed 同 id；UI 原地替换依赖此
  // Pass A 生成（streaming engine 内部分配）；Pass B segment 也带 id（独立分配，与 Pass A 不必关联）

  // 时间
  start: number // 秒，相对于录音起点（不算 pause）
  end: number

  // 内容
  text: string
  speaker: string // v0.1 取值：'mic' / 'system' / 'mixed'
  // v0.2 diarization 取值：'mic-1' / 'mic-2' / 'system-1' 等
  // UI 调色映射见 design-system §5.1.2（speaker-1..5+）；
  //   v0.1 渲染：'mic' → speaker-1，'system' → speaker-2，'mixed' → speaker-3
  //   未知 speaker → speaker-5+（灰色），保证 v0.2 加入新值时 UI 不崩

  // —— Multi Pass 稳定性 ——
  stability: 'hypothesis' | 'confirmed' // 仅 transcript.live.json 用；transcript.json（Pass B）全部 'confirmed'
  // UI 视觉区分见 design-system §5.5.1

  // VAD / ASR 元数据（可选，UI 用不到，调试用）
  confidence?: number // 0~1
  tokens?: Array<{ text: string; start: number; end: number }> // ASR 原始字级时间戳，**只读**
  // v0.2 引入 transcript edit 时：tokens 保持原值不变；编辑结果走新增的 displayText 派生字段
}
```

### 4.2 决定

| 字段                             | 决定                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 段落时间用**秒**                 | 与 sherpa-onnx 输出一致；UI 显示 mm:ss 由 renderer 格式化                                                       |
| `speaker` 用 `string` 而非 union | v0.1 实际取 'mic'/'system'/'mixed'，但 v0.2 diarization 会引入 'mic-1' 等，提前用 string 避免破坏性 schema 变更 |
| `tokens` 可选 + 标注只读         | 字级时间戳数据量大（一小时 ~几 MB），仅在用户开"精确点击"设置时存（默认开）；v0.2 transcript edit 不动 tokens   |
| 不存原始 logits / 隐状态         | 用不到，且体积爆炸                                                                                              |

### 4.3 大小估算

1 小时会议中文转录 ~5 万字 + 时间戳：

| 字段                        | 估算                                             |
| --------------------------- | ------------------------------------------------ |
| segments[] 文本 + start/end | ~150 KB                                          |
| 含 tokens[]（字级）         | ~3 MB                                            |
| pretty-print 还是 minified  | minified；diff 友好但 JSON 不是人读的就别 pretty |

### 4.4 与 audio 的对齐

`segments[i].start` 是相对于录音开始的秒数。点击跳转：

```
点 segments[i]
  → 播放器 currentTime = segments[i].start
```

如果 `pauseSegments` 存在（用户按过暂停），跳转有歧义：转录的"秒数"是按 mic / system WAV 的连续时间算的（pause 期间没数据），所以直接 `currentTime` 是对的——WAV 文件里 pause 也没填空。

如果未来引入"墙钟时间映射"（如 v0.2 录音中可加书签），再加 `wallClockOffsetMs` 字段。

### 4.5 错误状态下的 transcript

转录失败 → `transcript.json` **不写**，meta.transcribe.status=failed + error。UI 显示"转录失败 [重试]"。

转录中途取消 → 已经出的段落丢弃，不写 partial transcript（v0.1 简化）。

**v0.2 引入 partial transcript 的 schema 演进**：

- `transcript.json` 新增 `partial?: boolean` 字段
- `meta.transcribe.status` 与 partial 互不冲突：partial transcript 可能出现在 status=`failed`（中途失败保留已识别部分）或 `done`（用户主动停止转录提前保存）
- consumer 看到 partial=true + status=failed → UI 显示"已识别 N 段，可重试补全"

---

## 5. 录音库索引：library/index.json

### 5.1 问题

PRD §4 F5.1 / F5.2 要求按日期分组 + 全文搜索。两个选项：

| 方案                                                   | 选不选                                 |
| ------------------------------------------------------ | -------------------------------------- |
| A. 每次启动扫 `recordings/` 全目录，解析每份 meta.json | 不选：100 条录音以下还行，再多启动就慢 |
| B. 维护一份 `library/index.json`，meta 写时同步更新    | **选**                                 |

不用 SQLite 的理由：v0.1 量级（千条以内）一份 JSON 完全够；引 SQLite 多一个 native 依赖 + 签名复杂度。

### 5.2 Schema

```ts
// library/index.json
type LibraryIndex = {
  schemaVersion: 1
  lastBuiltAt: number // 全量重建时间戳；用于诊断（"索引有多老"），不用于 reconcile 判据
  // 增量更新**不刷**该字段，仅 rebuildIndex() 才刷
  // reconcile 是否重读 entry 由 entry.syncedAtMtime 与 meta.json mtime 比较决定（见 §5.4）

  entries: LibraryEntry[] // 按 startedAt 倒序
}

type LibraryEntry = {
  id: string
  title: string
  sessionType: SessionType
  startedAt: number
  durationMs: number
  status: RecordingMeta['status']
  transcribeStatus: RecordingMeta['transcribe']['status']
  summaryStatus: RecordingMeta['summary']['status']
  transcriptPreview?: string // PRD F5.3 首句预览，~80 字符
  syncedAtMtime: number // 写 entry 时记下的 meta.json mtime；reconcile 用它判断是否需重读
  // 不放完整 transcript：搜索时按需 lazy 读 transcript.json
}
```

### 5.3 搜索（PRD F4.3 / F5.2）

v0.1 用**朴素扫描**：

```
search(query):
  results = []
  for entry in index.entries:
    if query in entry.title or query in entry.transcriptPreview:
      results.push({ entry, hit: 'title-or-preview' })
    else:
      transcript = lazy load transcript.json
      for segment in transcript.segments:
        if query in segment.text:
          results.push({ entry, segment })
          break  // 每条录音首个命中即可
```

性能预估：1000 条录音，每条 transcript ~150 KB，最坏全扫 ~150 MB / SSD 顺序读 ~0.5 s。可接受。

优化（v0.2）：

- 在 index.json 里给每条加 `fullText: string`（去时间戳、去 segments 边界，仅文本）→ 用空间换时间
- 引 minisearch / lunr 在 renderer 内做倒排索引
- 上 SQLite FTS5

### 5.4 索引一致性

主进程持有内存中的 `LibraryIndex`，是 truth source。**启动两阶段，UI 永不阻塞**：

```
阶段 1（同步、阻塞主窗口前）：
  └─ 读 library/index.json → 内存
     └─ 通过 IPC 给 renderer，列表立即可用（哪怕略旧）

阶段 2（异步、后台 reconcile）：
  └─ 扫 recordings/* 与 index 对账（增量）：
        - 目录在但 index 没 → 新增（读 meta.json 补 entry，syncedAtMtime 填 stat.mtime）
        - index 有但目录没了（用户外部删） → 移除
        - fs.stat(meta.json).mtime > entry.syncedAtMtime → 重读 meta + 刷 syncedAtMtime
     └─ 每发现一条变化即 IPC `library:entry-added/removed/meta-updated` 推 renderer
     └─ reconcile 完成后 atomic write index.json + 刷 lastBuiltAt

录音 / 转录 / 摘要状态变化：
  └─ 内存 LibraryIndex 更新对应 entry → 异步 atomic write 持久化（debounce 500ms）
```

**损坏 / 缺失场景**：

- `index.json` 损坏 → UI 立即给空列表 + 顶部"正在重建索引"骨架屏 → 后台全量扫 recordings/ → 完成后推送 entries → 隐藏骨架屏
- 100 条 < 1s、1000 条 ~10s——但用户**不**感知阻塞，可以照常录音 / 操作设置

**为什么不走 SQLite**：1000 条以下纯 JSON 重建 10s 可接受；引入 SQLite 增加 native 依赖 + 签名复杂度。dogfood 阶段如发现 5000 条以上仍待用，再考虑迁移。

---

## 6. LLM 摘要：summary.md + 模板

### 6.1 summary.md 格式

`summary.md` 是**纯 markdown 文本**，不是 JSON。

理由：

- 模板（meeting / note / interview）输出结构差异大；用 markdown headers 表达就够，不需要 schema
- 用户复制 / 导出友好（PRD F7.2 md 导出基本就是它本身）
- v0.1 LLM 输出"再加工"成本最低

如果未来要做"标记完成的待办"之类的功能，再考虑在 markdown 上叠 frontmatter / 旁路 JSON。

### 6.2 内置模板：templates/builtin/\*.json

```ts
// templates/builtin/meeting.json
type Template = {
  schemaVersion: 1
  id: string // 'builtin/meeting'，user 自定义则 'user/<ulid>'
  name: string // 显示名 "会议纪要"
  sessionType?: SessionType // 与会话类型默认关联；null 表示通用
  builtin: boolean // 内置 true，用户自定义 false
  prompt: {
    system: string
    user: string // 可含变量：{{transcript}} {{title}} {{date}}
  }
  output: {
    format: 'markdown' // v0.1 仅此一种
    maxTokens?: number
  }
}
```

变量替换由主进程在调 LLM 前完成；`{{transcript}}` 替换的是 transcript.segments 文本拼接（带 speaker 前缀）。

### 6.3 模板更新

- 内置模板跟 app 发版：app 包内 `app.asar` 里有一份只读副本，启动时 copy 到 `templates/builtin/` 覆盖（用户不应该改 builtin）
- 用户从内置模板"另存为"自定义 → 写到 `templates/user/<ulid>.json`，可改可删

---

## 7. 模型清单：models/manifest.json

### 7.1 Schema

```ts
// models/manifest.json
type ModelManifest = {
  schemaVersion: 1
  models: {
    [modelKey: string]: {
      kind: 'asr' | 'vad' | 'punct'
      version: string // 'sense-voice-zh-en-ja-ko-yue-2025-09-09-int8'
      downloadedAt: number
      bytesTotal: number
      files: Array<{
        relPath: string // 相对 models/{modelKey}/
        sha256: string
        bytes: number
      }>
      source: 'hf-mirror' | 'modelscope' | 'github-releases'
    }
  }

  // v0.x GPU 加速 / 其它 native bundle 的按需下载预留位
  // v0.1 始终为空对象。schema 提前定，下载器 / 校验 / manifest 写入逻辑可复用同一套代码
  nativeBundles?: {
    [bundleKey: string]: {
      // 如 'sherpa-onnx-win32-x64-cuda-12.x'
      kind: 'asr-engine-gpu' | 'codec-runtime' | string
      version: string
      downloadedAt: number
      bytesTotal: number
      files: Array<{ relPath: string; sha256: string; bytes: number }>
      source: string // GitHub release / 自托管
    }
  }
}
```

### 7.2 用途

| 场景               | 用法                                                                            |
| ------------------ | ------------------------------------------------------------------------------- |
| 启动检查模型完整性 | 扫描 `manifest.models[modelKey].files`，校验存在性 + 文件大小（不全量 SHA，慢） |
| 下载完成后写入     | 全量 SHA 校验 → 写 manifest                                                     |
| 切换模型           | 用 `modelKey` 查 manifest，缺失则触发下载                                       |
| 卸载模型           | 删 `models/{modelKey}/` + manifest 移除条目                                     |

### 7.3 SHA256

- 下载时**强制**校验，失败重下（PRD §5.1）
- 启动时**不**全量校验（GB 级模型每次启动算几秒不值）；只在用户主动"重新校验"或转录失败疑似模型损坏时触发

---

## 8. 日志：logs/\*.log

### 8.1 主进程日志

- 文件：`logs/main.log`
- Rotate：单文件 10 MB，保留 3 份（`main.log.1` `main.log.2`）
- 内容：进程生命周期事件、IPC 调用摘要（**不含 PCM payload**）、错误 stack

### 8.2 ASR utility 日志

- 文件：`logs/asr.log`
- utility process 通过 message port 把日志回灌主进程统一落盘
- 不允许 utility 直接写文件，避免与主进程文件 I/O 竞争

### 8.3 隐私 / 脱敏分级

**两级脱敏**——`meta.json` / `settings.json`（设备本地数据）与 `logs/*.log`（可能被 share 出去）按不同强度处理：

| 数据                      | meta / settings  | 日志                                                    |
| ------------------------- | ---------------- | ------------------------------------------------------- |
| API key                   | safeStorage 加密 | 永不出现                                                |
| `apiBaseUrl` 完整 URL     | 完整存           | host 拆解 + 6 位 hash：`<host:abc123>` 跨日志条目关联用 |
| 用户主目录                | 完整路径         | `~/Library/...` 占位                                    |
| transcript / summary 内容 | 落盘             | 永不出现                                                |
| 录音 id / sessionType     | 完整存           | 完整存（非敏感）                                        |

**主进程 IPC 日志层的 channel 黑名单**——避免高频 / 含 payload 的消息泄漏：

```
blacklistedChannels = [
  'audio:track-open', 'audio:chunk', 'audio:track-close',       // PCM payload
  'audio:writer-ack', 'audio:writer-error',
  'summary:chunk',                                              // LLM 输出内容
  'transcribe:progress',                                        // 高频，仅在 debug 模式记 phase
]
```

黑名单内的 channel 调用**不**进 IPC summary 日志；错误情况另走 error 日志（但 detail 字段被裁剪到首 200 字符 + 字符级 redaction）。

renderer console 输出不持久化（PRD §7.2）。

---

## 9. 文件清理与删除

### 9.1 删除单条录音

PRD §7.2："物理删除文件夹，不进回收站"。

```ts
async function deleteRecording(id) {
  // 1. 如果转录 / 摘要 / 混音在跑，发取消信号
  await Promise.all([
    transcribeOrchestrator.cancelAndWait(id, { timeoutMs: 5000 }),
    mixer.cancelAndWait(id, { timeoutMs: 2000 }),
  ])
  // 2. 物理删整个目录
  await fs.rm(recordingsDir(id), { recursive: true, force: true })
  // 3. 内存 + 持久化 index 移除
  libraryIndex.remove(id)
  await persistIndex()
}
```

**为什么要等取消而非直接 rm**：

- Windows 上文件被 utility process 读时 `fs.rm` 报 EBUSY，删除失败留下半空目录
- macOS 上 inode 删除后 utility 仍能读 fd，但 LibraryIndex 已移除会引起转录完成时回写 transcript.json 到孤儿目录

**5s timeout 兜底**：utility 卡死时强删——最坏情况 utility 自己崩溃，主进程监听 `exit` 后清理残余。

`fs.rm` 在 macOS / Windows 上对几 GB 大文件秒级返回。用户体验上没必要做"软删除 30 天"。

### 9.2 清理孤立模板 / 残留 .tmp

启动时扫描：

| 残留                                               | 行为                                         |
| -------------------------------------------------- | -------------------------------------------- |
| `recordings/*/meta.json.tmp` 且 `meta.json` 不存在 | 提升为正式（崩溃恢复）                       |
| `recordings/*/meta.json.tmp` 且 `meta.json` 也存在 | 删 .tmp（写 meta 时崩溃，正式版本完好）      |
| `recordings/*/` 没有 meta.json                     | 视为损坏，重命名为 `_broken/{id}/`，提示用户 |
| `templates/user/*.json` schema 不对                | 跳过加载，不删；UI 显示"无效模板"图标        |

### 9.3 模型与 app 卸载

PRD §7.5：模型目录在 app 卸载时**不删**。

- electron-builder 的 macOS .pkg / Windows installer 默认只删 `{Applications}/LazyAudio.app` / `{Program Files}/LazyAudio/`
- 用户数据 `{userData}/LazyAudio/`（包含 `models/`）**默认保留**，与上述约束一致
- 设置页给"清空所有数据"按钮，用户主动删

---

## 10. Schema 版本与迁移

每份持久化 JSON 都带 `schemaVersion: number`：

| 文件                          | 当前版本 | 迁移规则                                             |
| ----------------------------- | -------- | ---------------------------------------------------- |
| settings.json                 | 1        | 缺失字段补默认值；多余字段忽略不删（forward compat） |
| recordings/\*/meta.json       | 1        | 同上                                                 |
| recordings/\*/transcript.json | 1        | 同上                                                 |
| library/index.json            | 1        | 全量重建（轻量）                                     |
| templates/\*.json             | 1        | 升级时 builtin/ 用 app 包内版本覆盖                  |
| models/manifest.json          | 1        | 全量重建（重新扫 models/ + 文件大小）                |

破坏性改动（删字段 / 改语义）→ `schemaVersion++` + 写 `migrate_X_to_Y` 函数 + 单元测试。

不允许"原地破坏字段意义"——加新字段而非改老字段语义。

---

## 11. 跨进程数据访问规则

| 谁          | fs 访问                                  | 信任级别                       |
| ----------- | ---------------------------------------- | ------------------------------ |
| 主进程      | 全部 `{userData}/LazyAudio/*`            | 完全可信                       |
| ASR utility | 完整 fs 权限（与主进程同）               | **完全可信**（视为主进程扩展） |
| Renderer    | **不直接 fs 访问**；所有读写经主进程 IPC | 不可信                         |

**关于 utility process 的访问范围**：
之前考虑过让 utility "只读 wav + models"做权限隔离。结论是放弃——utility process 在 OS 层就是主进程子进程，没有真正的能力隔离手段。规约式的 allowlist 在 code review 里容易被破坏，反而给出"已经隔离"的虚假安全感。架构上明确：**utility process 是主进程的可信扩展**，独立进程只是为了崩溃隔离 + 长任务不阻塞，**不**为了权限隔离。设计上仍约定 utility 只读 wav + models（避免与主进程写竞争），但靠 code review 而非运行时检查。

为什么 renderer 不允许 fs：

- 路径泄露到 devtools / 错误上报
- 设置里用户改 saveDir 后，renderer 需要重新协商权限语义，麻烦
- IPC 的边界正好是审计点，所有数据流动都过主进程

例外：renderer 想给用户"在 Finder / Explorer 中显示"（F5.4）→ IPC 调主进程 `shell.showItemInFolder`，不返回路径。

---

## 12. 开放问题

- **录音"导入外部音频"**：v0.2 可能加"导入已有 mp3"功能，需要决定 meta.audioFiles 是否允许指向 `recordings/{id}/` 之外的路径。倾向：导入时 copy 进来，不存外部引用，避免用户挪文件后失联。
- **transcript.json 字级 tokens 默认开 / 默认关**：开了体积膨胀 ~20×；点击精确定位手感更好。倾向默认开，设置可关。
- **library/index.json 的 transcriptPreview 何时刷新**：第一次转录完写入，用户重转录后是否更新？倾向更新，写 `transcribe.generatedAt` 决定。
- **多 app 实例共享 `{userData}/LazyAudio/`**：PRD §未提，但 `singleInstanceLock` 后实际不存在。第二实例直接退出，不需要文件锁。
- **加密 at rest**：v0.1 不加密；用户已选"本地优先"= 信任 OS 文件权限。v0.2 可考虑 macOS FileVault / Windows BitLocker 之外再叠应用层加密——目前不做。

---

## 13. 跨文档导航

| 想了解                                        | 看                                                         |
| --------------------------------------------- | ---------------------------------------------------------- |
| WAV header 字段、PCM 落盘细节                 | [`audio-capture.md`](./audio-capture.md) §5                |
| 本地 / 云端转录怎么产出 transcript.json       | [`transcription-pipeline.md`](./transcription-pipeline.md) |
| `library:*` `secrets:*` IPC 协议              | [`ipc-contract.md`](./ipc-contract.md)                     |
| 进程拓扑全景                                  | [`overview.md`](./overview.md) §2                          |
| 关键决策（ULID id、JSON 不 SQLite、模板存储） | [`adr/`](./adr/) 待写                                      |
