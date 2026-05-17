# 编码规约

> **版本**：v0.1-draft
> **日期**：2026-05-17
> **状态**：04-development；上手前必读，ESLint + tsconfig 兜底其中能机器化的部分

---

## 0. 这份文档解决什么

把"代码长什么样、命名怎么取、错误怎么处、IPC 怎么调"统一到一份文档，避免:

- "你这儿用 camelCase，我这儿用 snake_case" 这种 PR 争论
- "我不知道这个错该 throw 还是 return null" 这种新人卡点
- "renderer 直接 import 主进程的工具类" 这种系统性漏洞

**机器能管的不手动管**：所有能写进 ESLint / tsconfig / prettier 的规则都写进去，本文档讲为什么 + 例外。

---

## 1. TypeScript

### 1.1 严格性

`tsconfig.json` 全部打开：

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,        // arr[i] 自动是 T | undefined，强迫处理
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "verbatimModuleSyntax": true,            // import type 必须明确
    "isolatedModules": true                  // 配合 Vite
  }
}
```

### 1.2 类型 vs 接口

- **type** 用在：union、tuple、mapped、IPC payload、API response
- **interface** 用在：类的形态、可扩展的 props（如 `LazyAudioApi`）
- 不要用 `Record<string, any>`；要 `Record<string, unknown>` 或更精确的形态

### 1.3 `any` / `unknown`

- **`any` 禁用**（eslint 报错）；确实绕不开（第三方包没类型）→ 写 `// eslint-disable-next-line @typescript-eslint/no-explicit-any` + 一行注释为什么
- `unknown` 优先；用之前必须 narrow（zod parse / `typeof` / `instanceof`）
- 把 `unknown` 透传到边界外 → 必须先收敛成明确类型

### 1.4 函数签名

- 优先 named export 函数，避免 default export（refactor 友好、grep 友好）
- 函数 ≥ 3 个参数 → 用 options object
- 返回值类型显式标注（exported 函数必标，内部函数靠推断）
- async 函数返回 `Promise<T>` 不要省略

### 1.5 不可变性

- 优先 `readonly` 数组 / 对象字段
- React 状态、IPC payload 都视作不可变
- 不在 zustand store 里 mutate state；用 `set(prev => ...)`

### 1.6 schema 版本号单源

所有持久化 JSON（settings / meta / transcript / models manifest / index 等，[`../03-architecture/data-model.md`](../03-architecture/data-model.md) §10）的 `schemaVersion` 字段**必须**从 `shared/schema-version.ts` 取，不允许任何文件 hardcode 数字：

```ts
// shared/schema-version.ts
export const SCHEMA_VERSION = {
  settings: 1,
  recordingMeta: 1,
  transcript: 1,
  libraryIndex: 1,
  modelsManifest: 1,
  template: 1,
} as const
```

落盘前：

```ts
import { SCHEMA_VERSION } from '@shared/schema-version'
const payload = { schemaVersion: SCHEMA_VERSION.recordingMeta, ...rest }
```

升 version 必须同时改 `shared/schema-version.ts` + 加 migration（见 [`../03-architecture/data-model.md`](../03-architecture/data-model.md) §10）。改一处漏一处 = 字段漂移。

### 1.7 import 顺序

ESLint 自动 sort：

1. Node 内置 (`node:fs`)
2. npm 包 (`react`, `electron`)
3. 项目 alias (`@shared/...`, `@/...`)
4. 相对路径 (`./`, `../`)

每组内按字母序，组间空行。

---

## 2. 命名

### 2.1 文件 / 目录

- `kebab-case.ts` —— 所有源文件、测试、scripts
- 例外：React 组件文件 `PascalCase.tsx`（与 default exported 组件名一致）
- utility process 入口 `.cts`（详见 [`project-structure.md`](./project-structure.md) §3.1）
- 测试 fixture 目录 `__fixtures__/`（双下划线是社区惯例）

### 2.2 标识符

| 类别 | 风格 | 示例 |
|---|---|---|
| 变量 / 函数 | `camelCase` | `wavWriter`, `forkUtility` |
| 类 / 类型 / interface | `PascalCase` | `WavWriter`, `RecordingMeta` |
| 常量（真常量，且全局共享）| `SCREAMING_SNAKE_CASE` | `MAX_RECORDING_SECONDS` |
| 局部 const 配置对象 | `camelCase` | `const defaultOpts = {...}` |
| zod schema | `PascalCase`，与 inferred type 同名 | `RetryArgs` / `type RetryArgs` |
| Enum / Union literal | `kebab-case` 字符串字面量 | `'idle' \| 'recording' \| 'paused'` |
| React 组件 | `PascalCase` | `TranscriptPanel` |
| React hooks | `camelCase`，`use` 前缀 | `useRecordTick` |
| Zustand store | `camelCase`，`use*Store` 后缀 | `useRecordingStore` |
| IPC channel | `domain:verb-noun` 全小写 | `record:start`、`transcribe:live-segment` |
| 错误 code | `kebab-case` 字符串 | `'permission-denied'`、`'sherpa-dylib-missing'` |
| CSS class（Tailwind 之外）| `kebab-case` | `.transcript-row` |
| 环境变量 | `SCREAMING_SNAKE_CASE`，`LAZYAUDIO_` 前缀 | `LAZYAUDIO_LOG_LEVEL` |

### 2.3 不要做的命名

- ❌ 缩写：`recMgr`、`txEng`、`utlProc` —— 完整词
- ❌ 类型前缀：`IFoo`、`TFoo` —— 用纯名字
- ❌ 主进程类型前后加 `Main`：`MainTranscribeOrchestrator` —— 文件位置已经说明了
- ❌ 复数 / 单数混乱：函数返回数组就叫 `getRecordings`，返回单条 `getRecording`

---

## 3. 注释

**默认不写注释。** 写了的话必须满足下面之一：

| 情况 | 例子 |
|---|---|
| 解释 why，不是 what | `// 必须先 await spawn 再 postMessage——transcription-pipeline §3.2.1 A3` |
| 标注系统约束 / spec 引用 | `// PRD §7.1 内存上限 2.5 GB；超出 → orchestrator 拒绝 fork 第二个 utility` |
| 警告陷阱 | `// 不要把这个 import 提到顶层——会触发 dual-package hazard（CJS/ESM）` |
| TODO 必带 owner + 条件 | `// TODO(wentx): 等 spike-013 数据回来再决定 segmentId 是否要加 hash 后缀` |

**禁止**：

- ❌ 解释代码字面意思（`// 设置标题`）
- ❌ 函数顶部多行 JSDoc 复述参数（类型已经在签名里）
- ❌ commented-out 代码（用 git history）
- ❌ 装饰性分隔线（`// ============ utility ============`）

JSDoc 仅在两种情况下用：

1. exported public API（preload 的 `window.lazyaudio` 接口）—— renderer 端 IntelliSense 看得到
2. 函数有 non-obvious side effect 必须警告（"会写盘"、"会触发 IPC 广播"）

---

## 4. 错误处理

### 4.1 总原则

- **不静默吞错**：catch 了一定要 log + 决定是 throw / return error / 显示给用户
- **不在中间层包装错误**：除非加了真信息（"读 settings.json 失败" + 原 cause）
- **错误码字符串化**：用 `'permission-denied'` 而不是数字，方便日志 grep + i18n key 映射

### 4.2 主进程

```ts
// 模块内部
class WavWriterError extends Error {
  constructor(public code: 'disk-full' | 'invalid-state' | 'io-failed',
              message: string,
              public cause?: unknown) {
    super(message)
  }
}

// 边界（IPC handler）—— 转成 IpcError
ipcMain.handle('record:start', async (_, args) => {
  try {
    return await recorder.start(args)
  } catch (e) {
    throw toIpcError(e)         // util，统一映射
  }
})
```

`toIpcError` 在 `src/main/ipc/_helpers.ts`，把内部 Error 转成 ipc-contract §1.4 定义的 `IpcError`（带 `code` + `recoverable`）。

### 4.3 Renderer

```ts
// preload 已经把 reject 转成 { ok: false, error }
const result = await window.lazyaudio.record.start(args)
if (!result.ok) {
  // 1. 显示给用户：根据 error.code 查 i18n
  toast.error(t(`errors.${result.error.code}`))
  // 2. log 完整 error（开发模式）
  if (import.meta.env.DEV) console.error(result.error)
  return
}
```

**禁止**：renderer 直接 throw 让 React error boundary 捕获——boundary 只兜组件渲染错；业务错走显式分支。

### 4.4 Utility process

- 任何未捕获 exception → main 收到 `exit` 事件 → 重启策略最多 3 次（transcription-pipeline §3.6）
- utility 内主动 catch 后 `parentPort.postMessage({ type: 'fatal', code, detail })` —— 比 silent crash 好诊断

### 4.5 不要做的

- ❌ `try { ... } catch (e) {}` 空 catch
- ❌ `catch (e) { throw e }` 没价值的 re-throw
- ❌ `Promise.allSettled` 后不看 rejected
- ❌ 用 boolean 代替错误：`function load(): boolean` —— 改成 `Result<T, Error>` 或 throw

---

## 5. IPC 模式

### 5.1 一条新的 IPC 通道怎么加

1. `shared/ipc/{domain}.ts` 加 channel name + zod schema：

    ```ts
    export const CHANNEL = {
      ...,
      myThing: 'mydomain:my-thing',
    } as const

    export const MyThingArgs = z.object({
      foo: z.string(),
      bar: z.number().int(),
    })
    export type MyThingArgs = z.infer<typeof MyThingArgs>

    export const MyThingResult = z.object({
      ok: z.boolean(),
    })
    export type MyThingResult = z.infer<typeof MyThingResult>
    ```

2. `src/main/ipc/{domain}.ts` 注册 handler：

    ```ts
    import { CHANNEL, MyThingArgs, MyThingResult } from '@shared/ipc/mydomain'
    import { assertSchemaDev } from '@/util/assert-schema'

    export function register(): void {
      ipcMain.handle(CHANNEL.myThing, async (_, rawArgs) => {
        const args = MyThingArgs.parse(rawArgs)        // 不可信输入：prod 也跑 parse
        const result = await doMyThing(args)
        assertSchemaDev(MyThingResult, result)         // 自己出去的：dev assert，prod 跳过（见 §5.2）
        return result
      })
    }
    ```

    `assertSchemaDev` 是 `src/main/util/assert-schema.ts` 的小 helper：

    ```ts
    export function assertSchemaDev<T>(schema: z.ZodType<T>, value: unknown): void {
      if (!import.meta.env.DEV) return
      const r = schema.safeParse(value)
      if (!r.success) throw new Error(`schema mismatch: ${r.error.message}`)
    }
    ```

    main → renderer 事件广播也用同一个 helper（symmetric）。

3. `src/preload/bridge/make-api.ts` 暴露：

    ```ts
    myDomain: {
      myThing: (args: MyThingArgs) => invoke(CHANNEL.myThing, args),
    }
    ```

4. `shared/types/api.ts` 加进 `LazyAudioApi` interface

5. Renderer 调：

    ```ts
    const result = await window.lazyaudio.myDomain.myThing({ foo: 'a', bar: 1 })
    ```

**这个流程不可省略 zod validate**——renderer 进程是攻击面（XSS / 恶意扩展），main 必须把所有 IPC 输入视作不可信。

### 5.2 IPC 双向 validate

| 方向 | validate | 理由 |
|---|---|---|
| renderer → main（invoke args）| **必须** | 不可信输入 |
| main → renderer（event payload）| dev 时 assert，prod 跳过 | 信任自己的代码，但 dev 早暴露 schema 不一致 |
| main ↔ utility | **必须** | utility 是独立进程，崩溃 / 重启后可能行为漂移；同时也是 schema 漂移的高发地 |

### 5.3 高频事件（`record:tick` / `transcribe:live-segment`）

每秒数十条的事件 → zod parse 有开销 → 用 throttle + dev-only assert：

```ts
// main 发
const payload = { ts: Date.now(), durationMs }
if (import.meta.env.DEV) RecordTickPayload.parse(payload)
webContents.send(CHANNEL.tick, payload)
```

ipc-contract §12 定的 throttle 间隔（`record:tick` 100ms）也由发送方实现。

### 5.4 MessagePort

PCM 流走 `MessagePortMain`（zero-copy + Transferable）：

- renderer 拿到 port 后用 `port.postMessage(buf, [buf.buffer])` 传 ArrayBuffer
- main 接收 → 写 wav + fork 给 utility
- **不**经过 IPC channel（高吞吐场景 ipcRenderer.send 会塞死 IPC bus）

详见 audio-capture.md §4。

---

## 6. 模块边界（ESLint rule 兜底）

```js
// eslint.config.js（节选）
{
  files: ['shared/**/*.ts'],
  rules: {
    // 禁 runtime 包：shared 必须是纯数据
    'no-restricted-imports': ['error', {
      patterns: [
        'electron', 'electron-*',
        'react', 'react-dom',
        'fs', 'node:fs', 'path', 'node:path',
      ],
    }],
    // shared 内部互相 import 允许；用 no-restricted-paths 阻止"越界"到 src/
    // （`'../**'` / `'./**'` 是错的：会把 shared/ipc/record.ts 引 './types' 也禁掉，
    //  导致 shared 内部模块没法互相引用）
    'import/no-restricted-paths': ['error', {
      zones: [
        { target: './shared', from: './src', message: 'shared/ cannot import from src/' },
      ],
    }],
  },
},
{
  files: ['src/renderer/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        'electron',          // renderer 没 nodeIntegration
        'electron-*',
        'fs', 'node:*',
        '../main/**',
        '@/main/**',
      ],
    }],
  },
},
{
  files: ['src/main/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        'react', 'react-*',  // 主进程没 React
        'tailwindcss',
        '../renderer/**',
        '@/renderer/**',
      ],
    }],
  },
},
```

违反 → lint 直接 fail；不要 disable，改架构。

---

## 7. 状态管理

### 7.1 Zustand 模板

```ts
// src/renderer/stores/recording-store.ts
import { create } from 'zustand'

type RecordingState = {
  status: 'idle' | 'preparing' | 'recording' | 'paused' | 'stopping'
  durationMs: number
  // ...
}

type RecordingActions = {
  setStatus(s: RecordingState['status']): void
  setDuration(ms: number): void
}

export const useRecordingStore = create<RecordingState & RecordingActions>((set) => ({
  status: 'idle',
  durationMs: 0,
  setStatus: (status) => set({ status }),
  setDuration: (durationMs) => set({ durationMs }),
}))
```

- **不在 store 里做 IPC**——hook 层做，store 只存数据
- **不在 store 里 derive state**——派生用 selector

### 7.2 状态权威源

- **设置、库列表、录音状态机** → 主进程权威，renderer store 只是镜像（订阅 IPC 同步）
- **UI 状态**（modal 开关、当前选中的列表项）→ renderer 权威

不要让 renderer "本地推进" 录音状态（overview §4.2 已约束）。

---

## 8. React 模式

### 8.1 组件分类

- **页面级**（`src/renderer/windows/main/App.tsx`）：拿数据、组合子组件，不写样式细节
- **领域组件**（`detail/Player.tsx`）：业务知识 + 行为
- **基础组件**（`components/Button.tsx`）：纯 props in / UI out，对应 design-system

### 8.2 props

- 优先 destructure props，不写 `props.foo`
- 不要 spread props 到 DOM（除非组件是真 wrapper）
- children 当 prop 处理，类型 `React.ReactNode`

### 8.3 hooks

- 每个 hook 一个文件
- 命名 `useXxx`，第一句 doc 说明它**做了什么 + 副作用是什么**

```ts
/** 订阅主进程 record:tick 事件，返回当前录音时长。组件 unmount 时自动取消订阅。 */
export function useRecordTick(): number {
  ...
}
```

### 8.4 性能

- 默认不预优化（`React.memo` / `useMemo` 不要先加）
- profiler 看到瓶颈再优化；优化必带 measure 数据
- 长列表（库列表 > 200 条）用 `@tanstack/react-virtual`

---

## 9. 样式（Tailwind）

### 9.1 token 来自 design-system

`tailwind.config.ts` 把 design-system §2 / §3 / §4 的 token 全部录入：

```ts
theme: {
  extend: {
    colors: {
      gray: { 50: '#FAFAFA', /* ... */ 950: '#09090B' },
      accent: { DEFAULT: '#1F6FEB', dark: '#4493F8' },
      record: { DEFAULT: '#E5484D', dark: '#FF6369' },
      // 类型色
      type: {
        meeting: '#3B82F6',
        note: '#EAB308',
        // ...
      },
    },
    spacing: { 1: '4px', 2: '8px', 3: '12px', /* ... */ },
    borderRadius: { sm: '4px', md: '6px', lg: '8px', xl: '12px' },
    fontSize: {
      xs: ['11px', '16px'],
      sm: ['13px', '20px'],
      // ...
    },
    fontFamily: {
      sans: ['-apple-system', 'BlinkMacSystemFont', /* ... */],
      mono: ['"SF Mono"', 'Menlo', /* ... */],
    },
  },
}
```

### 9.2 编写

- 优先 Tailwind utility class，不写 component-scoped CSS 文件
- 复杂的 layout（>10 个 utility class）抽 React 组件，不在 JSX 里写一坨
- 动效用 `transition-*` + custom keyframes（`@keyframes breathe` 写在 `styles/globals.css`）
- **深色模式**：`dark:` prefix；token 已经把浅 / 深变体定好，class 写 `bg-white dark:bg-gray-900`

### 9.3 禁止

- ❌ 内联 `style={{ ... }}`，除非真的动态计算（如 `style={{ width: pct + '%' }}`）
- ❌ styled-components / emotion
- ❌ 直接写颜色 hex（必须走 token）

---

## 10. i18n

### 10.1 用法

```tsx
import { useTranslation } from 'react-i18next'

function StartButton() {
  const { t } = useTranslation('recording')
  return <Button>{t('start')}</Button>
}
```

- 所有用户可见文案走 `t('namespace.key')`
- namespace = `src/renderer/i18n/locales/zh-CN/{namespace}.json` 的文件名
- key 用 dot.notation，按 UI 区域分组

### 10.2 错误文案

主进程返回 `error.code`；renderer 用 `t('errors.<code>')` 映射：

```json
// errors.json
{
  "permission-denied": "权限被拒绝，请到系统设置中授予权限",
  "sherpa-dylib-missing": "本地转录引擎初始化失败：缺少必要的运行时文件",
  ...
}
```

未知 code → `t('errors.unknown', { code })` 兜底。

### 10.3 禁止

- ❌ 硬编码中文字符串（lint rule 兜底，仅 `aria-label` / 测试代码豁免）
- ❌ 拼接句子：`t('hello') + name + t('world')` —— 用插值 `t('greeting', { name })`
- ❌ 主进程做 i18n —— main 仅传 error code

---

## 11. 测试

### 11.1 写什么

| 层 | 工具 | 测什么 |
|---|---|---|
| shared / pure utils | vitest | 100% 分支覆盖，无 mock |
| main 业务模块 | vitest + 手动 mock electron | 状态机转移、IPC handler 逻辑、文件读写（用 mem-fs） |
| renderer 组件 | vitest + jsdom + @testing-library/react | 关键交互，不追求覆盖率 |
| e2e | playwright + electron | onboarding 走通、录 30s + 转录、删除录音 |

### 11.2 命名

```
tests/unit/main/recorder/wav-writer.test.ts   # 与源码同名 + .test
tests/e2e/onboarding.spec.ts                  # e2e 用 .spec
```

### 11.3 mocks

- electron 模块的 mock 写在 `tests/__mocks__/electron.ts`，所有 unit test 共用
- 文件系统用 `memfs`，不用真盘
- sherpa-onnx 用 `tests/__mocks__/sherpa-onnx.ts`，返回固定 fake transcript

---

## 12. Git workflow

### 12.1 分支

- `main` — 永远可发布
- `dev/<feature>` — 开发分支，PR 合到 main
- `release/v0.x.x` — 临时发版分支，仅 cherry-pick fix（v0.1 之后启用）

### 12.2 commit

Conventional Commits：

```
feat(recorder): add 30s wav header flush
fix(transcribe): handle utility crash on first PCM chunk
docs(architecture): add ADR-0001 macOS minimum version
chore: bump electron to 35.2.0
```

scope 对应 `src/main/<domain>/` 或 `src/renderer/<window>/` 一级目录名。

### 12.3 PR 模板

```
## Summary
1-3 句话：改了什么、为什么

## Touches
- [ ] main
- [ ] renderer
- [ ] utility
- [ ] preload
- [ ] shared (IPC schema 改动 → schemaVersion 是否升？)

## Tests
- [ ] unit
- [ ] e2e
- [ ] 本地 packaged 包验证（涉及 native / 签名 / 权限的改动必勾）

## Linked
- Architecture: ...
- Spike: ...
- PRD: §...
```

### 12.4 不要

- ❌ force push 到 main
- ❌ `--no-verify` 跳过 pre-commit
- ❌ 一个 PR 解决三个无关问题（拆）
- ❌ commit 进 .env / 模型文件 / 录音 fixture > 1 MB

---

## 13. 安全

### 13.1 必做

- preload 用 `contextBridge.exposeInMainWorld`，white-list API
- BrowserWindow `webPreferences`:

    ```ts
    {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    }
    ```

- API key 仅在 main + safeStorage；preload / renderer / utility 都拿不到
- IPC handler 输入用 zod 校验
- 外部 URL 打开走 `shell.openExternal`，不在 BrowserWindow 内 navigate

### 13.2 不做

- ❌ `nodeIntegration: true` —— 任何时候、任何窗口
- ❌ `webSecurity: false` —— 哪怕 dev
- ❌ 在 renderer 用 `fetch` 直接调云端 API（绕开主进程 = 绕开 key 保护）
- ❌ 把绝对路径 log 到 stdout（隐私）

---

## 14. 性能

### 14.1 主进程

- WAV append 用 `fs.createWriteStream`，不 buffer 整段
- 任何 > 50ms 的 sync 操作禁止（会卡 event loop → renderer ipc 卡）
- CPU 密集任务（resample / mixdown）→ utility process 或 worker_threads

### 14.2 Renderer

- AudioWorklet 不能 ScriptProcessor 替代
- 转录列表 1k+ 段落 → virtual scroll
- 不在 render 函数里建 Date / 正则 / 数组（move 到 useMemo / module scope）

### 14.3 Utility

- 单 utility 内只跑一个 ASR session
- 模型 unload 时机：transcription-pipeline §3.7 已定（idle > 60s）

---

## 15. 速查

| 想做的事 | 看哪节 |
|---|---|
| 加一个 IPC 通道 | §5.1 |
| 拿不到 sherpa-onnx 类型 | §1.3 + 装 `@types/sherpa-onnx` 或 declare module |
| renderer 想读文件 | 不能直接读 → 加 `system:read-file` IPC |
| 加一个新窗口 | [`project-structure.md`](./project-structure.md) §5.1 多 entry |
| 加一个 LLM 模板 | `native/templates/` 放 JSON + 改 settings 默认映射 |
| 跑 spike 临时代码 | `scripts/` 下加 `tsx` 脚本，不进 src/ |
| 改 design token | `tailwind.config.ts` + `styles/tokens.css` + design-system.md 同步 |

---

## 16. 下一阶段

[`build-and-release.md`](./build-and-release.md) — 怎么打包、签名、公证、发布。
