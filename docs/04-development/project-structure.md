# 项目结构（Electron + Vite + React + TypeScript）

> **版本**：v0.1-draft
> **日期**：2026-05-17
> **状态**：04-development 启动前 finalize 的源码 layout；落到第一个 commit 后变更走 PR
> **替代**：[`../03-architecture/overview.md`](../03-architecture/overview.md) §5.2 草案

---

## 0. 这份文档解决什么

把"git clone 下来之后看到的目录是什么、每个东西放哪儿、为什么这么放"讲清楚。读完应该能：

- 知道任何一个新文件该放哪里
- 知道任何一个已有模块在哪里
- 知道为什么挑了 electron-vite 而不是手撸 Vite + Electron

**不解决**：怎么把环境跑起来（见 [`dev-environment.md`](./dev-environment.md)）、怎么打包发布（见 [`build-and-release.md`](./build-and-release.md)）。

---

## 1. 技术栈速查

| 层            | 选型                                   | 版本                 | 理由                                                                                      |
| ------------- | -------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------- |
| 桌面框架      | **Electron**                           | ≥ 35                 | CoreAudio Tap 默认开启（PRD §7.4 / tech-feasibility R1）；utility process 成熟            |
| 构建工具      | **electron-vite** (alex8088)           | ≥ 4                  | 官方推荐 Electron + Vite 整合方案；原生支持 main / preload / renderer 三段、多 entry、HMR |
| 渲染 UI       | **React** + **TypeScript**             | React 19、TS 5.x     | PRD §8 已定                                                                               |
| 包管理        | **pnpm**                               | ≥ 9                  | PRD §8 已定；workspace / 硬链接对 native 模块 + 多平台 prebuilt 友好                      |
| 样式          | **Tailwind CSS** + **CSS variables**   | Tailwind 4           | 与 design-system tokens（颜色 / 间距 / 圆角）一一对应；不要 styled-components / emotion   |
| 状态管理      | **Zustand**                            | ≥ 5                  | 跨窗口、跨组件状态轻量；避免 Redux 样板                                                   |
| IPC schema    | **Zod**                                | ≥ 3                  | ipc-contract §11 已定（IPC 双向 validate）                                                |
| i18n          | **react-i18next** + **i18next**        | —                    | overview §6.4 已定                                                                        |
| 路由          | 不用                                   | —                    | 多窗口 = 多 HTML entry；窗口内一两屏直接 conditional render，路由开销不值                 |
| 单元测试      | **Vitest**                             | ≥ 2                  | 与 Vite 同栈                                                                              |
| 端到端        | **Playwright** for Electron            | ≥ 1.45               | 官方 Electron 支持成熟                                                                    |
| Lint / Format | **ESLint** + **Prettier**              | ESLint 9 flat config | overview §6 i18n / IPC 用自定义 rule 兜底                                                 |
| Git hooks     | **simple-git-hooks** + **lint-staged** | —                    | 比 husky 轻                                                                               |
| 原生转录      | **sherpa-onnx** + 平台 prebuilt 包     | 1.13.x               | sherpa-onnx-research §4 / §5                                                              |
| 打包发布      | **electron-builder**                   | ≥ 25                 | 签名 + 公证 + dmg/nsis 一站式；asarUnpack 配置成熟                                        |

> **不引入的依赖**（避免 v0.1 复杂度）：
>
> - ❌ Redux / MobX —— 用 Zustand
> - ❌ styled-components / emotion —— 用 Tailwind
> - ❌ dayjs / moment —— 用 `Intl.DateTimeFormat`（overview §6.4）
> - ❌ axios —— 用 `fetch`（Node ≥ 18 内置）
> - ❌ lodash —— 标准库够用
> - ❌ husky —— 用 simple-git-hooks
> - ❌ react-router —— 多窗口不需要

---

## 2. 顶层目录

```
lazyaudio/
├── .github/
│   └── workflows/
│       ├── ci.yml                  # PR check：lint + test + 签名构建 + smoke test
│       └── release.yml             # tag 触发：完整 build + 公证 + 上传 GitHub Releases
├── .vscode/                        # 推荐配置（不强制）
│   ├── extensions.json
│   └── settings.json
├── .claude/                        # Claude Code 配置（已存在）
├── build/                          # electron-builder 资源（icon / entitlements / 安装脚本）
│   ├── icon.icns
│   ├── icon.ico
│   ├── icon.png
│   ├── entitlements.mac.plist
│   └── notarize.js                 # afterSign hook（公证）
├── scripts/
│   ├── after-pack.cjs              # electron-builder afterPack hook（macOS dylib 改写 + 重签）
│   ├── after-sign.cjs              # 公证（与 build/notarize.js 二选一，单文件即可）
│   ├── dev-reset.ts                # 清掉 userData / models，方便重跑 onboarding
│   ├── verify-prebuilt.ts          # CI 用：验证当前平台 sherpa-onnx 二进制可加载
│   └── ci/
│       ├── import-mac-certs.sh     # 临时 keychain + 解码 base64 p12 + import + unlock
│       └── release-notes.sh        # 从 docs/04-development/changelog.md 抽当前版本段 → GitHub Release notes
├── shared/                         # 跨进程共享的类型 / 常量 / schema
│   ├── ipc/                        # ipc 通道名 + zod schema
│   │   ├── record.ts
│   │   ├── transcribe.ts
│   │   ├── library.ts
│   │   ├── settings.ts
│   │   ├── secrets.ts
│   │   ├── model.ts
│   │   ├── summary.ts
│   │   ├── system.ts
│   │   └── index.ts                # re-export
│   ├── types/                      # 业务领域类型
│   │   ├── recording.ts            # RecordingMeta、TranscriptSegment 等
│   │   ├── settings.ts
│   │   ├── template.ts
│   │   └── model.ts
│   ├── constants/                  # 不变量：sessionType 枚举、错误码、限制值
│   │   ├── session-type.ts
│   │   ├── error-codes.ts
│   │   └── limits.ts
│   └── schema-version.ts           # 各 schema 当前 version 集中维护
├── src/
│   ├── main/                       # 主进程（Node）
│   ├── preload/                    # preload 脚本
│   └── renderer/                   # 渲染进程（React，多窗口共用）
├── native/                         # 内置模板 / 静态资源 / 模型清单（随 app 发版的只读资产）
│   ├── templates/                  # 5 个内置 LLM 模板 JSON（data-model §6）
│   │   ├── meeting.json
│   │   ├── note.json
│   │   ├── interview-as-interviewer.json
│   │   ├── interview-as-candidate.json
│   │   └── lecture.json
│   └── models/
│       └── registry.json           # 内置模型清单（id / 镜像列表 / sha256），不含模型文件本身
├── tests/
│   ├── unit/                       # vitest（main / shared 单元）
│   ├── renderer/                   # vitest jsdom（renderer 组件）
│   └── e2e/                        # playwright + electron
├── docs/                           # 本仓库唯一的文档目录（已存在）
├── electron.vite.config.ts         # electron-vite 入口配置
├── electron-builder.yml            # 打包配置
├── tsconfig.json                   # 根 tsconfig（path alias / 全局选项）
├── tsconfig.node.json              # 主进程 / preload / scripts 用
├── tsconfig.web.json               # renderer 用（DOM lib）
├── tsconfig.worker.json            # utility process 用（CJS、no DOM）
├── eslint.config.js                # ESLint 9 flat config
├── prettier.config.js
├── tailwind.config.ts
├── postcss.config.cjs
├── vitest.config.ts
├── playwright.config.ts
├── package.json
├── pnpm-lock.yaml
├── .editorconfig
├── .gitignore
├── .gitattributes
├── .nvmrc                          # 锁定 Node 主版本
├── LICENSE
└── README.md
```

> 设计原则：**根目录尽量少**。任何 5 个以上同类文件聚成子目录；script、build 资源、native 资产分别下沉。

---

## 3. `src/main/` —— 主进程

主进程职责清单见 [`../03-architecture/overview.md`](../03-architecture/overview.md) §2.1。文件 layout 按"领域"切，每个领域一个目录：

```
src/main/
├── index.ts                        # 入口；按 app lifecycle 顺序 wire 子模块
├── env.ts                          # NODE_ENV / app.isPackaged / 路径工具
├── lifecycle/
│   ├── app-ready.ts                # app.whenReady + single-instance lock
│   ├── before-quit.ts              # 退出守卫（录音中需确认）
│   └── deep-link.ts                # v0.2 预留（lazyaudio://）
├── windows/
│   ├── window-manager.ts           # BrowserWindow 实例注册表；防止 dev 模式 main code reload 时旧窗口未销毁导致 leak / 重复创建
│   ├── main-window.ts              # 主窗口
│   ├── prep-window.ts              # 录音前浮窗（常驻隐藏）
│   ├── onboarding-window.ts        # 首启 onboarding
│   └── settings-window.ts          # 设置窗口
├── menu/
│   ├── app-menu.ts                 # macOS 顶部 menu bar
│   ├── tray.ts                     # 菜单栏 / tray 图标 + dropdown
│   └── context-menu.ts             # 列表项右键
├── shortcut/
│   ├── register.ts                 # globalShortcut.register（含冲突检测）
│   └── handler.ts                  # callback：弹 prep / 触发 stop
├── recorder/                       # 录音域（audio-capture.md）
│   ├── orchestrator.ts             # 录音状态机（idle → preparing → recording → ...）
│   ├── pcm-receiver.ts             # 接 renderer 的 MessagePort PCM 流
│   ├── wav-writer.ts               # 流式 append + 30s 周期 header flush
│   ├── mixer.ts                    # 录完后合成 mixed.wav
│   └── pcm-fork.ts                 # Multi Pass：PCM downmix + fork 到 Pass A utility
├── transcribe/                     # 转录域（transcription-pipeline.md）
│   ├── orchestrator.ts             # TranscribeOrchestrator（Pass A / B 协调）
│   ├── engine-registry.ts          # EngineRegistry（local / cloud 工厂）
│   ├── streaming/
│   │   ├── local-streaming.ts      # StreamingEngine：local-streaming-zipformer / vad-shortwin
│   │   └── cloud-streaming.ts      # cloud-openai-stream —— v0.1 仅占位 throw NotImplementedError；PRD F4.9 云端 Multi Pass 默认关；M5 T53 之后视反馈决定是否实现
│   ├── offline/
│   │   ├── local-sense-voice.ts    # OfflineEngine：local-sense-voice
│   │   ├── openai-compatible.ts    # OfflineEngine：cloud
│   │   └── loader.ts               # sherpa 平台 dir 解析 + 早失败检查（transcription-pipeline §3.2）
│   ├── utility-spawn.ts            # utilityProcess.fork + init init message
│   └── queue.ts                    # 持久化任务队列（transcription-pipeline §3.7）
├── workers/                        # utility process 入口（与主进程同 process tree，但独立打包）
│   └── asr/
│       ├── index.cts               # CommonJS 入口，require('sherpa-onnx')；transcription-pipeline §3.2.1
│       ├── streaming.cts           # streaming session 处理循环
│       ├── offline.cts             # offline transcribe 处理
│       └── shared/                 # asr utility 内部共享
│           ├── platform-dir.cts
│           └── log.cts             # 通过 parentPort 回灌主进程日志
├── llm/                            # 摘要域
│   ├── summarizer.ts               # SummarizerFacade（transcription-pipeline §6）
│   ├── openai-compatible-client.ts # HTTP client + 流式
│   ├── template-engine.ts          # 模板变量替换
│   └── chunker.ts                  # 长 transcript MapReduce（v0.x）
├── library/                        # 录音库域
│   ├── library-store.ts            # library/index.json 读写 + reconcile
│   ├── scanner.ts                  # 两阶段扫描（data-model §5.4）
│   └── search.ts                   # 全文搜索（轻量 in-memory；v0.x 上 minisearch）
├── settings/
│   ├── settings-store.ts           # settings.json + migration
│   ├── secrets.ts                  # safeStorage 封装（data-model §3.2）
│   └── migrate.ts                  # schemaVersion 升级
├── model/                          # 模型下载域
│   ├── downloader.ts               # HTTP Range + 断点续传
│   ├── manifest-store.ts           # models/manifest.json
│   ├── verify.ts                   # SHA256 校验
│   └── mirror.ts                   # 多源 fallback（hf-mirror / github / hf）
├── system/                         # 平台 / 权限
│   ├── permissions.ts              # 麦克风 / 屏幕录制 / accessibility 状态查询
│   ├── audio-sources.ts            # desktopCapturer 包装
│   ├── notify.ts                   # 系统通知 + 白名单
│   └── reveal.ts                   # 在 Finder / Explorer 中显示
├── ipc/                            # ipcMain.handle 注册
│   ├── register.ts                 # 启动时统一 wire 所有 channel
│   ├── record.ts
│   ├── transcribe.ts
│   ├── library.ts
│   ├── settings.ts
│   ├── secrets.ts
│   ├── model.ts
│   ├── summary.ts
│   └── system.ts
├── logger/
│   ├── index.ts                    # 主进程 logger（rotate）
│   └── transports/
└── util/                           # 通用工具（仅主进程用）
    ├── fs-atomic.ts                # write-then-rename 原子写
    ├── ulid.ts
    └── format-time.ts
```

### 3.1 命名约定（主进程）

- **类**：`PascalCase`（`TranscribeOrchestrator`, `WavWriter`）
- **模块导出函数**：`camelCase`，动词起头（`registerShortcuts`, `forkAsrUtility`）
- **文件名**：`kebab-case.ts`
- **utility process 入口**：必须 `.cts` 扩展名（CommonJS），与 sherpa-onnx-node CJS 兼容。打包后是 `.cjs`
- **IPC handler 文件**：与 [`../03-architecture/ipc-contract.md`](../03-architecture/ipc-contract.md) §2 域名一一对应（`record.ts` 对 `record:*` 通道）

### 3.2 主进程不允许 import 的东西

- `src/renderer/**`（renderer 是隔离的，没有 cross-import）
- `react`、`react-dom`、`tailwindcss` 类前端运行时
- 直接 require `.node` —— 必须通过 utility process（transcription-pipeline §3.1）

允许 import：

- `shared/**`（IPC schema、类型、常量）
- `electron` API
- Node 标准库
- `native/**` 下的 JSON 资产（通过 `import.meta.glob` 或显式 require）

---

## 4. `src/preload/` —— Preload 脚本

```
src/preload/
├── index.ts                        # 主窗口 / 设置窗口 / 录音库 preload
├── prep.ts                         # 录音前浮窗 preload（精简白名单）
├── onboarding.ts                   # onboarding preload（开机一次性）
└── bridge/
    ├── make-api.ts                 # contextBridge.exposeInMainWorld('lazyaudio', api)
    ├── invoke.ts                   # 包装 ipcRenderer.invoke + zod parse + 错误归一化
    ├── on.ts                       # 包装 ipcRenderer.on，返回 unsubscribe
    └── port.ts                     # MessagePort 高吞吐（PCM stream）
```

**约定**：preload 是**白名单 API 唯一来源**。renderer 不允许直接访问 `window.electron` / `process` / `require`。

类型导出：preload 模块的 `LazyAudioApi` interface 必须在 `shared/types/api.ts` 里 re-export，renderer 拿到 `window.lazyaudio` 时有完整 typings：

```ts
// shared/types/api.ts
export interface LazyAudioApi {
  record: { start: ..., stop: ..., subscribeTick: ..., ... }
  library: { list: ..., ... }
  // ...
}

// src/renderer/global.d.ts
declare global {
  interface Window { lazyaudio: LazyAudioApi }
}
```

---

## 5. `src/renderer/` —— 渲染进程

```
src/renderer/
├── main.html                       # 主窗口入口 HTML
├── prep.html                       # 录音前浮窗
├── onboarding.html
├── settings.html                   # 设置窗口（独立）
├── main.tsx                        # 主窗口 React 入口（mount #root，注入 store / i18n）
├── prep.tsx
├── onboarding.tsx
├── settings.tsx
├── windows/                        # 每个窗口的根组件 + 子页面
│   ├── main/
│   │   ├── App.tsx                 # 路由分发（library / detail / empty / loading）
│   │   ├── sidebar/
│   │   │   ├── SidebarHeader.tsx   # traffic light + 设置 ⚙（design-system §10.1）
│   │   │   ├── SearchBox.tsx
│   │   │   ├── TypeChips.tsx
│   │   │   └── RecordingList.tsx
│   │   ├── detail/
│   │   │   ├── DetailHeader.tsx
│   │   │   ├── Player.tsx          # 波形 + 时间轴
│   │   │   ├── TranscriptPanel.tsx # hypothesis/confirmed 视觉（design-system §5.5.1）
│   │   │   └── SummaryPanel.tsx
│   │   └── empty/EmptyState.tsx
│   ├── prep/
│   │   ├── App.tsx                 # 浮窗内 360px 单页
│   │   ├── SessionTypeSelect.tsx
│   │   └── SourceToggles.tsx
│   ├── onboarding/
│   │   ├── App.tsx                 # 7 屏 wizard（screen-specs/onboarding.md）
│   │   └── steps/
│   │       ├── 01-welcome.tsx
│   │       ├── 02-privacy.tsx
│   │       ├── 03-permissions.tsx
│   │       ├── 04a-model-download.tsx
│   │       ├── 04b-api-config.tsx
│   │       ├── 05-shortcut.tsx
│   │       ├── 06-compliance.tsx
│   │       └── 07-done.tsx
│   └── settings/
│       ├── App.tsx                 # 左 nav + 右 content
│       └── tabs/
│           ├── General.tsx
│           ├── Recording.tsx
│           ├── TranscribeEngine.tsx
│           ├── LlmTemplates.tsx
│           ├── Shortcuts.tsx
│           ├── Privacy.tsx
│           └── About.tsx
├── components/                     # 跨窗口可复用 UI 组件（design-system §5）
│   ├── TypeBadge.tsx
│   ├── RecordingDot.tsx
│   ├── TranscriptStatus.tsx
│   ├── Timestamp.tsx
│   ├── SpeakerTag.tsx
│   ├── Button.tsx
│   ├── Input.tsx
│   ├── Floating.tsx
│   ├── Modal.tsx
│   └── Toast.tsx
├── audio/                          # renderer 侧音频采集（audio-capture.md §3-4）
│   ├── capture.ts                  # getUserMedia + desktopCapturer
│   ├── worklet.ts                  # AudioWorklet 加载
│   ├── pcm-encoder.ts              # Float32 → Int16
│   └── worklets/
│       └── pcm-tap.worklet.ts      # 与 audio-capture.md §3.3 `audio-worklet/pcm-tap.js` 同源；`.worklet.ts` 后缀让 Vite 自动单独 chunk
├── stores/                         # zustand stores（跨组件状态）
│   ├── recording-store.ts          # 主进程 record:tick 订阅 → store
│   ├── library-store.ts
│   ├── settings-store.ts
│   ├── transcribe-store.ts         # hypothesis/confirmed 段落维护
│   └── modal-store.ts
├── hooks/
│   ├── use-ipc.ts                  # invoke / on 的 React 封装
│   ├── use-record-tick.ts
│   ├── use-shortcut.ts             # window 内（非全局）快捷键
│   └── use-theme.ts
├── i18n/                           # overview §6.4
│   ├── index.ts
│   ├── locales/
│   │   ├── zh-CN/
│   │   │   ├── common.json
│   │   │   ├── onboarding.json
│   │   │   ├── recording.json
│   │   │   ├── library.json
│   │   │   ├── settings.json
│   │   │   └── errors.json
│   │   └── en/                     # v0.2
│   └── format.ts                   # Intl 包装：日期 / 时间 / 时长
├── styles/
│   ├── globals.css                 # tailwind base + reset + 字体栈
│   ├── tokens.css                  # design-system §2 / §4 token → CSS var
│   └── dark.css                    # 深色模式 override
├── lib/                            # 纯函数 / 浏览器工具（无 IPC）
│   ├── format-duration.ts
│   ├── ulid.ts
│   └── color.ts                    # session type → color 映射
└── global.d.ts                     # window.lazyaudio 类型 + Vite env types
```

### 5.1 多窗口的实现

electron-vite 支持 **multi-page renderer**：在 `electron.vite.config.ts` 里声明每个 HTML 入口，构建时各自打包成独立 bundle。

```ts
// electron.vite.config.ts（节选）
renderer: {
  build: {
    rollupOptions: {
      input: {
        main: 'src/renderer/main.html',
        prep: 'src/renderer/prep.html',
        onboarding: 'src/renderer/onboarding.html',
        settings: 'src/renderer/settings.html',
      },
    },
  },
}
```

主进程创建窗口时 load 对应文件：

```ts
// src/main/windows/main-window.ts
const url = is.dev
  ? `${process.env['ELECTRON_RENDERER_URL']}/main.html`
  : `file://${join(__dirname, '../renderer/main.html')}`
mainWindow.loadURL(url)
```

### 5.2 跨窗口共享 store

Zustand store 在每个窗口是**独立实例**（renderer 进程互相隔离）。共享状态走 **主进程作为 single source of truth**：

```
renderer A 改设置 → ipc.invoke('settings:set') → main 写 settings.json
                                                 → main.broadcast 'settings:changed'
                                                 → renderer A / B / C 各自 store.set
```

具体协议在 [`../03-architecture/ipc-contract.md`](../03-architecture/ipc-contract.md) §6。

### 5.3 renderer 不允许做的事

- `import('node:*')`、`require()`、`fs.readFileSync` —— renderer 没有 `nodeIntegration`
- 拿绝对路径（除非主进程显式回传）
- 直接调云端 API —— 通过 main `summary:run` / `transcribe:cloud-run` 走，API key 不出主进程
- 持久化敏感数据到 `localStorage` —— 走 `settings:set`

---

## 6. `shared/` —— 跨进程共享

三个进程（main / preload / renderer / utility）都能 import 的代码。

**规则**：

- **纯数据 / 类型 / 常量 / zod schema**，不能 import 任何 runtime（不能 import electron / react / node-only API）
- **不能有副作用**（顶层不允许 IO / window 访问）
- 同名文件分别在 `shared/types/recording.ts` 定 type，`shared/ipc/transcribe.ts` 定 zod schema + channel 名
- 错误码、限制值（CHUNK_SIZE / MAX_RECORDING_SECONDS 等）放 `shared/constants/`，避免散落各处

示例：

```ts
// shared/ipc/transcribe.ts
import { z } from 'zod'

export const CHANNEL = {
  retry: 'transcribe:retry',
  cancel: 'transcribe:cancel',
  progress: 'transcribe:progress', // event
  liveSegment: 'transcribe:live-segment', // event
  offlineOverwrite: 'transcribe:offline-overwrite',
  runPartialOffline: 'transcribe:run-partial-offline',
} as const

export const RetryArgs = z.object({
  recordingId: z.string().length(26), // ULID
})

export type RetryArgs = z.infer<typeof RetryArgs>
```

---

## 7. `native/` —— 随 app 发版的只读资产

```
native/
├── templates/
│   └── *.json                # 5 个内置 LLM 模板（data-model §6）
└── models/
    └── registry.json         # 模型注册表（sherpa-onnx-research §9.3）
```

- **不打 asar**（避免 hot fix 模板时整包重发）—— 通过 electron-builder `extraResources` 复制到 `process.resourcesPath`
- 主进程通过 `path.join(process.resourcesPath, 'native', 'templates', ...)` 访问
- 内置模板 read-only；用户自定义模板写在 `{userData}/templates/user/`

> sherpa-onnx 的 **运行时 .node + .dylib / .dll** 不在这里；它们随 npm 包 `node_modules/sherpa-onnx-{platform}-{arch}/` 进 `app.asar.unpacked`，详见 [`../03-architecture/transcription-pipeline.md`](../03-architecture/transcription-pipeline.md) §3.2。

---

## 8. `electron.vite.config.ts` —— 构建入口

```ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          // utility process entry 单独编译为 CJS，避免被打成 ESM
          'workers/asr/index': resolve('src/main/workers/asr/index.cts'),
        },
        output: {
          format: 'cjs',
        },
      },
    },
    resolve: {
      alias: { '@shared': resolve('shared') },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          prep: resolve('src/preload/prep.ts'),
          onboarding: resolve('src/preload/onboarding.ts'),
        },
      },
    },
    resolve: {
      alias: { '@shared': resolve('shared') },
    },
  },
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          main: resolve('src/renderer/main.html'),
          prep: resolve('src/renderer/prep.html'),
          onboarding: resolve('src/renderer/onboarding.html'),
          settings: resolve('src/renderer/settings.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@': resolve('src/renderer'),
        '@shared': resolve('shared'),
      },
    },
  },
})
```

**关键点**：

- `externalizeDepsPlugin()` 让 `dependencies`（sherpa-onnx、electron）在 main / preload 不被打包进 bundle，运行时从 `node_modules` require
- utility process 入口 **必须 CJS**（`.cts` → `.cjs`），与 sherpa-onnx-node 兼容（transcription-pipeline §3.2.1 B3）
- renderer 多 entry，每个 HTML 一个独立 bundle，code-split 自动按 entry 分

### 8.0.1 CJS/ESM 共存陷阱（必读）

根 `package.json` 是 `"type": "module"`（§9），但主进程 + utility 输出是 CJS。Node 看到 `out/main/index.js` 时会**向上找最近的 package.json type 字段** → 命中根 `module` → 按 ESM 解析 CJS 内容 → `SyntaxError: Unexpected token 'module'`。

两种解法，**任选其一**：

- **A（推荐，与 electron-vite 默认对齐）**：让 electron-vite 在 `out/main/`、`out/preload/`、`out/main/workers/` 各自注入 `package.json {"type":"commonjs"}` 覆盖。electron-vite 默认行为就是这样；只要**不手动改 `output.entryFileNames`**，这个覆盖文件就会生成。
- **B**：在 build 配置里把产物后缀改成 `.cjs`，Node 看到 `.cjs` 强制按 CJS 解析，无需 package.json 覆盖：

  ```ts
  main: {
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } },
  }
  ```

  用 B 时记得同步改 `package.json` 的 `"main": "out/main/index.cjs"`。

**别两个一起用、也别两个都不用**——是 electron + vite + ESM 项目最常翻车的点。

构建后验证：

```bash
ls out/main/package.json out/preload/package.json out/main/workers/asr/package.json
# 都应该存在，内容为 {"type":"commonjs"}（方案 A）
# 或：ls out/main/*.cjs（方案 B）
```

### 8.1 path alias 速查

| alias     | 解析到          | 哪些进程能用                                |
| --------- | --------------- | ------------------------------------------- |
| `@shared` | `shared/`       | main / preload / renderer / utility         |
| `@`       | `src/renderer/` | 仅 renderer（避免 main 误 import 前端代码） |

---

## 9. `package.json` 关键字段

```json5
{
  name: 'lazyaudio',
  version: '0.0.1',
  private: true,
  type: 'module', // 项目默认 ESM；utility 用 .cts 显式标 CJS
  main: 'out/main/index.js', // electron-vite 构建产物
  engines: { node: '>=22' },
  packageManager: 'pnpm@9.x',
  scripts: {
    dev: 'electron-vite dev',
    'dev:reset': 'tsx scripts/dev-reset.ts && electron-vite dev',
    build: 'electron-vite build',
    typecheck: 'tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit && tsc -p tsconfig.worker.json --noEmit',
    lint: 'eslint .',
    format: 'prettier --write .',
    test: 'vitest run',
    'test:e2e': 'playwright test',
    'verify:prebuilt': 'tsx scripts/verify-prebuilt.ts',
    'pack:mac': 'electron-vite build && electron-builder --mac',
    'pack:win': 'electron-vite build && electron-builder --win',
    release: 'electron-vite build && electron-builder --publish always',
  },
  dependencies: {
    'sherpa-onnx': '^1.13.2',
    i18next: '^23.x',
    'react-i18next': '^14.x',
    react: '^19.x',
    'react-dom': '^19.x',
    zod: '^3.x',
    zustand: '^5.x',
    ulid: '^2.x',
  },
  optionalDependencies: {
    'sherpa-onnx-darwin-arm64': '^1.13.2',
    'sherpa-onnx-darwin-x64': '^1.13.2',
    'sherpa-onnx-win32-x64': '^1.13.2',
  },
  devDependencies: {
    electron: '^35.x',
    'electron-builder': '^25.x',
    'electron-vite': '^4.x',
    '@vitejs/plugin-react': '^5.x',
    vite: '^5.x',
    typescript: '^5.x',
    vitest: '^2.x',
    '@playwright/test': '^1.45.x',
    playwright: '^1.45.x',
    eslint: '^9.x',
    '@typescript-eslint/parser': '^8.x',
    '@typescript-eslint/eslint-plugin': '^8.x',
    'eslint-plugin-react': '^7.x',
    'eslint-plugin-react-hooks': '^5.x',
    prettier: '^3.x',
    tailwindcss: '^4.x',
    postcss: '^8.x',
    autoprefixer: '^10.x',
    tsx: '^4.x',
    'simple-git-hooks': '^2.x',
    'lint-staged': '^15.x',
  },
  'simple-git-hooks': {
    'pre-commit': 'pnpm lint-staged',
  },
  'lint-staged': {
    '*.{ts,tsx,cts,cjs,js,jsx}': ['eslint --fix', 'prettier --write'],
    '*.{json,md,css,html}': ['prettier --write'],
  },
}
```

> **为什么 `sherpa-onnx-*` 是 optionalDependencies**：每个平台只装自己那份，pnpm 自动按 `process.platform` + `process.arch` 解析。CI 矩阵在每个 OS 上 `pnpm install --filter=...` 时只会拿对应的那一个，安装包不会带其它平台的二进制。
>
> 如果改成 `dependencies`，开发机 `pnpm install` 会去拉全部平台的 prebuilt（~80 MB 多余），且 lockfile 会卡住非当前平台的可选条目。`optionalDependencies` 是 Electron 生态对 native 模块的事实标准。

---

## 10. `tsconfig*.json` —— 多 target 分裂

为什么分三份？renderer 需要 DOM 类型、worker 不需要、主进程不需要 DOM 但需要 Node 类型。一份 tsconfig 兼顾会导致：

- renderer 拿到 `process.cwd`（错）
- main 拿到 `document`（错）
- worker import 了 `electron`（错）

```
tsconfig.json                # 根：path alias、严格模式、共享 options
├── tsconfig.node.json       # extends: main / preload / scripts
├── tsconfig.web.json        # extends: renderer（DOM lib）
└── tsconfig.worker.json     # extends: utility process（CJS、no DOM、no electron）
```

各 tsconfig 的 `include` 范围互不重叠：

| 配置                   | include                                                                      |
| ---------------------- | ---------------------------------------------------------------------------- |
| `tsconfig.node.json`   | `src/main/**`（不含 workers）+ `src/preload/**` + `scripts/**` + `shared/**` |
| `tsconfig.web.json`    | `src/renderer/**` + `shared/**`                                              |
| `tsconfig.worker.json` | `src/main/workers/**` + `shared/**`                                          |

`tsconfig.worker.json` 的 `types` 字段**必须 include `"electron"`**——utility process 用的 `process.parentPort` 是 Electron 注入的全局对象，类型声明来自 `node_modules/electron/electron.d.ts`。不 include → `process.parentPort` 推断为 `any` 或编译报错。

> 注意：include 仅是**类型**；ESLint rule（§6）仍然禁止 worker 代码 `import { ... } from 'electron'`。"拿类型可以、import runtime 不行"。

`shared/**` 因为需要被三方都消费、所以**不能 import 任何 runtime API**——这条约束由 ESLint rule 兜底（见 [`coding-conventions.md`](./coding-conventions.md) §6）。

---

## 11. `tests/` —— 测试

```
tests/
├── __mocks__/                      # 全局 mock（vitest 自动应用，coding-conventions §11.3）
│   ├── electron.ts
│   └── sherpa-onnx.ts
├── unit/                           # vitest，跑在 Node 环境
│   ├── shared/
│   ├── main/                       # 主进程纯函数（recorder/wav-writer 等）
│   └── workers/
├── renderer/                       # vitest jsdom
│   ├── components/
│   └── stores/
└── e2e/                            # playwright + electron
    ├── fixtures/
    │   ├── recordings/             # 测试用 wav
    │   └── fake-cloud-server.ts
    ├── onboarding.spec.ts
    ├── record-and-transcribe.spec.ts
    └── library.spec.ts
```

**约定**：

- 单元测试与源码不放一起（`*.test.ts` 同目录的风格不用）—— 保持 `src/` 干净
- e2e 跑真签名包（CI 强制，见 [`build-and-release.md`](./build-and-release.md) §6）
- 不依赖 sherpa-onnx 模型的测试用 fake adapter，模型文件不进 git

---

## 12. `.gitignore` 必带项

```
node_modules/
out/                                # electron-vite 构建产物
dist/                               # electron-builder 产物
.vite/
*.log
.DS_Store
.env
.env.*
!.env.example
coverage/
playwright-report/
test-results/

# 本地 dev 时下载的模型 / 录音
.local-userdata/
```

---

## 13. 与 03-architecture 的差异说明

[`overview.md`](../03-architecture/overview.md) §5.2 给的草案是：

```
electron/
├── main/
│   └── workers/asr/
└── preload/
src/
```

本文档改为：

```
src/
├── main/
│   └── workers/asr/
├── preload/
└── renderer/
```

**变更理由**：

1. `electron-vite` 默认约定就是 `src/{main,preload,renderer}` 三段；脱离约定要写一堆 alias，对新人不友好
2. workers 留在 `src/main/workers/`——它属于主进程的 fork，逻辑归属一致
3. 渲染源从 `src/` 下沉到 `src/renderer/`，跟主进程对称，理解成本降低

03-architecture 文档不需要回写——overview §5.2 已声明"TBD 在 04-development 启动前确认"。

---

## 14. 常见疑问

**Q：为什么不用 Next.js / Tauri / Wails？**

- Next.js 是 web 框架，Electron 内层装 React 就够了，多一层 Next 是浪费
- Tauri 用 Rust + WebView，没有 utility process 抽象、没有 N-API 生态，sherpa-onnx 集成路径不通
- Wails 同理，且 macOS WebView 不能稳定调 `getUserMedia({audio: chromeMediaSourceId})`

**Q：为什么不用 React Server Components / RSC？**

- Electron renderer 是纯客户端，没有 server 概念，RSC 无意义

**Q：为什么不用 monorepo（turborepo / nx）？**

- 单个 app，没有跨包共享需求；`shared/` 一个文件夹够用
- v0.2 如果要做 web 端镜像 / CLI 工具，再升级 monorepo

**Q：utility process 为什么单独 CJS？**

- sherpa-onnx-node 是 CJS 包；ESM 包 require 它会触发 dual-package hazard
- electron-vite 主进程是 ESM，但 utility process entry 显式 `.cts`，构建产物 `.cjs`，加载 sherpa-onnx 没坑

**Q：能不能在 renderer 直接跑 sherpa-onnx WASM 版？**

- sherpa-onnx-research §3 已结论否决：WASM 单线程、性能差 5×+。utility process 是唯一推荐路径

**Q：preload 那么薄，能不能合到 main 里？**

- 不能。preload 是 Electron sandbox 模型的固定入口；没有 preload 就拿不到 `contextBridge`，renderer 也就不能安全调 IPC

---

## 15. 进入下一阶段

读完这份文档应该能回答：

- [ ] 主进程 / preload / renderer / utility 各自的目录是哪个
- [ ] 我加一个新的 IPC 通道，schema 该放哪个文件
- [ ] sherpa-onnx 的 .dylib 跑时从哪里找
- [ ] tailwind class 写在哪、design token 怎么用
- [ ] 跑一个 e2e 测试需要哪些前置（spike-004 + 签名包）

如果还有疑问 → 在 PR 评论里问，本文档需要兜回答。

接下来：

1. [`dev-environment.md`](./dev-environment.md) — 把环境搞起来
2. [`coding-conventions.md`](./coding-conventions.md) — 写代码的 lint / 命名 / 注释规约
3. [`build-and-release.md`](./build-and-release.md) — 打包、签名、发布
4. [`development-plan.md`](./development-plan.md) — M3 → M7 的任务清单和顺序
