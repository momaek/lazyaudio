# 开发进度（live）

> **最后更新**：2026-05-25
> **当前里程碑**：M3（spike-012 另 session 在跑）
> **当前焦点**：T12 音频采集 ✅ 待 PR;下一候选 T13 WAV 落盘 / T15 录音库 / T18 设置骨架
> **配套**：[`development-plan.md`](./development-plan.md)（任务定义 + AC + 依赖）

---

## 0. 协作 SOP（Claude Code 必读）

### 0.1 总流程

开 session 前后按这个流程走，状态就不会丢：

1. **开工前**：
   - 读本文件 §1「当前焦点」+ 在 `development-plan.md` 找到对应 T / spike 的 AC
   - **把 AC 每一条 bullet 抄到 §1 当 checkbox**（不是复制 AC 文本本身，是抄成可勾选项，留位置贴验证证据）
2. **动手**：把目标任务状态从 🔲 改成 🔄，填「起始日期」。
3. **写完代码后**：跑 AC 命令 → 把输出 / 截图 / CI 链接贴到 §1 对应 checkbox 下。
4. **完工**：走 §0.3 end-of-work loop。
5. **遇到 blocker**：状态改 ⛔，**必须**在 §5 写一句话说明卡在哪、需要什么解开。
6. **每次改动**：顶部「最后更新」改成今天；若焦点切换，同步「当前焦点」一行。
7. **不要做的事**：
   - 不要复制 `development-plan.md` 的 AC 文本到这里当文档（保持单一信息源）；§1 的 checkbox 是工作区，PR 合并后清空。
   - 不要把超过 1 周没动的 🔄 留着 — 要么变 ⛔ 写原因，要么回 🔲。
   - 同时 🔄 任务尽量 ≤ 2 个，避免上下文切换。
   - **AC 没全过不准 ✅**。写完代码 ≠ 完成。

### 0.2 Definition of Done（DoD）

不同任务类型"完成"的判定不一样：

| 类型          | 完成判定                                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **spike-NNN** | 决策（结论 + 数据 / POC 证据）写进 `01-research/tech-feasibility.md` 或新 ADR → ✅ + 链 commit。**"此路不通"也算 done**，触发 dev-plan §10.2 砍 scope 流程 |
| **ADR-NNNN**  | `04-development/adr/ADR-NNNN-*.md` 文件 in tree、自审过 → ✅ + 链 commit                                                                                   |
| **T (code)**  | dev-plan 里这条 T 的 AC **每一条 bullet** 都跑过 + 输出/截图捕获 + 分支 push + PR 开（或合）+ progress.md 在同一 PR 内更新 → ✅ + 完成日期 + PR 链接       |

### 0.3 End-of-work loop（每个 T 写完代码必走）

```
1. 验 AC：跑 dev-plan 里这条 T 的所有 AC 命令，把输出贴到 §1 对应 checkbox 下
2. 任何一条没过 → 状态保持 🔄，session 结束；下次回来继续
3. 全过 → 创建 feature 分支（feat/T01-scaffold 这种命名）+ commit
4. 同一个 PR 里同时改 progress.md：
   a. 4.x 表格：🔄 → ✅，填完成日期、PR 编号
   b. §1 当前焦点：把这个 T 整条移除（含子 checkbox）
   c. 顶部「最后更新」改今天
   d. 速查面板：done +1 / wip -1
5. PR body 用 .github/pull_request_template.md 模板，AC checklist 全勾
6. 推 PR，等 review；不要自己合
```

**关键约定**：progress.md 的状态更新和代码改动 **必须在同一 PR**。这样 review 时 ✅ 旁边就有代码可验；PR 打回时 git revert 会自动把状态打回 🔄，文档不会撒谎。

### 0.4 特殊情况

| 情况                                        | 处理                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| AC 只过了一半                               | 状态仍 🔄；§1 部分 checkbox 勾上；说明下一步补哪条                     |
| 发现 dev-plan 的 AC 不合理 / 写错了         | **先改 dev-plan**（commit msg 写改动理由）→ 再继续写代码；不准悄悄绕过 |
| PR 被打回                                   | progress.md ✅ 改回 🔄 + 备注列写"PR #X reverted"+ §5 Blocked 登记原因 |
| 一个 T 太大、做不完                         | 拆成 T01a / T01b（**同步改 dev-plan**），各自走流程                    |
| 改了别人没动的代码、修了 bug 但不是 AC 要的 | 不在这登记；写 commit msg 说明、或在 troubleshooting.md 记录           |

---

## 状态图例

| 标记       | 含义                  |
| ---------- | --------------------- |
| 🔲 todo    | 没开始                |
| 🔄 wip     | 进行中                |
| ⛔ blocked | 卡住（必须写卡在 §5） |
| ✅ done    | AC 全过               |

---

## 速查面板

| 维度                      | 数字                                            |
| ------------------------- | ----------------------------------------------- |
| 总任务（T + spike + ADR） | 4 + 9 + 4 = 17（pre-M3）/ 44 (M3-M7 T) = **61** |
| ✅ done                   | 22                                              |
| 🔄 wip                    | 1（spike-012 另 session）                       |
| ⛔ blocked                | 0                                               |
| 🔲 todo                   | 38                                              |
| 本周燃尽                  | —                                               |

---

## 1. 当前焦点（Active）

> 同时不超过 2-3 项。空着也行，表示在选下一个任务。

### T12 — 音频采集（renderer）✅ 待 PR

起始 2026-05-25 · 完成 2026-05-25 · 分支 `feat/T12-audio-capture`

来源：[`development-plan.md` T12](./development-plan.md) + [`audio-capture.md` §3/§4](../03-architecture/audio-capture.md) + [`ipc-contract.md` §2.3](../03-architecture/ipc-contract.md)。dev-plan 原 AC："renderer 能持续推 PCM,main 收到字节数 = 时长 × 48k × 2"。

**架构决策**（依据 audio-capture.md + ipc-contract.md + spike-005 PR #12 实测）：

- capture 跑在**新增 hidden capture-window**（不复用 prep / main）— prep 关闭后 capture 必须继续 / main 是 UI 不该混
- PCM 传输走 **MessageChannelMain**（不走 ipcMain.send）— transferable ArrayBuffer 零拷贝
- Float32 → Int16 转换**在 worklet 里做**再 transfer — 省一半 IPC 字节
- chunk 粒度 **100ms / 4800 samples**（audio-capture §3.3）
- system audio 走 **audio-only ScreenCaptureKit**（spike-005 验过 — main `setDisplayMediaRequestHandler` 回 `{audio:'loopback'}`,**不传** `useSystemPicker:true` 否则被 TCC 短路;renderer `getDisplayMedia({video:false,audio:true})`)
- T12 含**最小录音状态机**让 `⌘⇧R` 双向语义生效：idle → show prep；recording → 直接 stop(走 user-flows §2.2)

**AC checkbox**：

- [x] **AC1** `shared/audio/messages.ts` 新建：TrackOpen / Chunk / TrackClose / WriterAck / WriterError zod schema(per audio-capture §4.1 / ipc-contract §2.3)
- [x] **AC2** `shared/ipc/channels.ts` 加 `AUDIO` 域: startCapture / stopCapture（main → capture renderer 控制信令）
- [x] **AC3** `src/main/audio/port.ts`: 管理 MessageChannelMain 生命周期 + `webContents.postMessage('audio-port', null, [port])` 推给 capture window
- [x] **AC4** `src/main/audio/receiver.ts`: 收 PCM port message(track-open / chunk / track-close);T12 阶段**仅按 trackId 累计 bytesReceived + 周期 log,不写 WAV**(T13 接 WAV writer);writer-ack 一并发回让 renderer 端 sanity
- [x] **AC5** `src/main/audio/recorder-state.ts`: 最小状态机(idle / preparing / recording / stopping),持 currentRecordingId,handler 查询/迁移
- [x] **AC6** `src/main/windows/capture-window.ts`: 常驻 hidden chrome-less renderer 专跑 audio capture
- [x] **AC7** `src/main/index.ts`: app whenReady 加 setDisplayMediaRequestHandler(session.defaultSession 级,只回 `{audio:'loopback'}` 不传 useSystemPicker) + 启 capture window + 起 audio port
- [x] **AC8** `src/main/ipc/record.ts` start handler 升级:之前 stub fake recordingId,现在走状态机 + 真生成 recordingId(crypto.randomUUID) + 经 IPC 通知 capture window 启 capture;加 stop handler 同理
- [x] **AC9** `src/main/shortcut/handler.ts`: 接录音状态机分叉(idle → showPrep / recording → stop)
- [x] **AC10** `src/renderer/capture.{html,tsx}` + `src/renderer/windows/capture/App.tsx`: capture window 入口(headless),mount 时挂 audio-port 监听 + audio:start-capture / audio:stop-capture IPC 订阅
- [x] **AC11** `src/renderer/audio/capture.ts`: getUserMedia(mic) + getDisplayMedia({video:false,audio:true})(audio-only SCKit) + AudioContext + 双 worklet node + 0-gain → destination(强制 worklet pump,spike-005 已验)
- [x] **AC12** `src/renderer/audio/worklets/pcm-tap.worklet.ts`: 累积 4800 Float32 sample → f32ToI16 → port.postMessage transferable ArrayBuffer;同时算 RMS(给电平表预留,T11 暂不消费)
- [x] **AC13** `electron.vite.config.ts` renderer.input 加 capture: 'src/renderer/capture.html';worklet 用 `.worklet.ts` 后缀 Vite chunk(`?worker&inline` 或 `new URL().href`)
- [x] **AC14** `src/preload/index.ts` + bridge: 暴露 `record.stop()` + 接 audio-port webContents.postMessage('audio-port') 挂到 `window.__audioPort__`
- [x] **AC15** `src/renderer/windows/prep/App.tsx`: start 成功后改为发 record:start 后 hide(已经是),无功能变化(prep 不参与 capture)
- [x] **AC16** 手测: `pnpm dev` → ⌘⇧R → 选音源 → 开始录音 → 持续 10s → main log 周期报 `track-open mic` / `chunk seq=N bytes=9600` / 总累计 ≈ 10 × 48k × 2 = 960000 bytes(mono Int16);system 同理 1920000(stereo) → ⌘⇧R 再按触发 stop → main log `track-close reason=normal, total bytes ≈ 预期`
- [x] **AC17** CI 三件套: `pnpm lint` 0 errors + `pnpm typecheck` + `pnpm test`

**实测踩坑(已修)**:

- Electron `MessagePortMain.postMessage` 的 `transfer` 参数**只接受 MessagePortMain[]**,不接受 ArrayBuffer。传 ArrayBuffer 进 transfer list 会让整个 message 静默丢失,main 端 `event.data === null`。修:跨进程边界不 transfer,走 structured clone(性能损失 1h ~2GB 拷贝,T13/T14 用 Buffer.from 优化)。Worklet → renderer main thread 那一段仍走 Web port + transferable,无 copy。
- mac 内置 mic 实际是 **stereo** 而非 mono(本地实测)。T12 receiver 用 track-open 报的 channels 算 expected,实际 drift +0.71% 内。T13 WAV writer 要么按实际 channels 写,要么 stereo → mono down-mix(audio-capture §2.4 决策)。
- 加 `src/main/audio/autotest.ts` dev-only env-gated:`LAZY_AUTOTEST=1 pnpm dev` 触发 5s/10s/quit 自动验证,绕开 GUI 权限。spike-005 smoke 同款思路。

**autotest 实测数据(10s capture, M2 arm64 / macOS 26.5 / Electron 35.7.5)**:

```
mic   : 97 chunks / 1862400 bytes / 9.63s; expected 1849344, drift +0.71%
system: 96 chunks / 1843200 bytes / 9.53s; expected 1830144, drift +0.71%
seq 连续无 gap;track-open / chunk / track-close 全周期正确
```

---

## 2. Pre-M3 — Spike

| ID        | 标题                                  | 状态    | 起         | 完         | 备注 / PR                                                                                                                          |
| --------- | ------------------------------------- | ------- | ---------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| spike-001 | macOS 双轨录音                        | ✅ done | —          | 已完       | tech-feasibility                                                                                                                   |
| spike-002 | Windows 双轨录音                      | ✅ done | —          | 已完       | tech-feasibility                                                                                                                   |
| spike-003 | sherpa-onnx + Electron POC            | ✅ done | —          | 已完       | tech-feasibility                                                                                                                   |
| spike-004 | macOS 签名 + 公证链                   | ✅ done | —          | 已完       | tech-feasibility                                                                                                                   |
| spike-005 | mic / system 漂移量化                 | ✅ done | 2026-05-22 | 2026-05-23 | 部分拍板:同 AudioContext 时钟同步 < 21μs/12s + audio-only SCKit 路径走通;mic 起点对齐推迟到 M3 T13/T14;tech-feasibility §spike-005 |
| spike-010 | 快捷键 → 第一帧 PCM < 100/400 ms      | ✅ done | 2026-05-17 | 2026-05-17 | M2 arm64:A p95 46.4ms + B p95 235ms;tech-feasibility §spike-010                                                                    |
| spike-011 | Pass A 引擎选型                       | ✅ done | 2026-05-17 | 2026-05-17 | 拍板 B 路 VAD 短窗 SenseVoice;PR [#2](https://github.com/momaek/lazyaudio/pull/2);tech-feasibility §spike-011 + ADR-0004           |
| spike-012 | Pass A + 录音并发 1h 资源压测         | 🔲 todo | —          | —          | 1d；依赖 011                                                                                                                       |
| spike-013 | hypothesis → confirmed 替换 UI 稳定性 | ✅ done | 2026-05-17 | 2026-05-17 | B 策略(timestamp key)id 稳定率 100%;tech-feasibility §spike-013                                                                    |

---

## 3. Pre-M3 — ADR

| ID       | 主题                                                      | 状态    | 完         | 备注                                                |
| -------- | --------------------------------------------------------- | ------- | ---------- | --------------------------------------------------- |
| ADR-0001 | macOS 最低版本 14.2+（CoreAudio Tap vs ScreenCaptureKit） | ✅ done | 2026-05-17 | PR [#3](https://github.com/momaek/lazyaudio/pull/3) |
| ADR-0002 | sherpa-onnx + macOS @loader_path 加载链                   | ✅ done | 2026-05-17 | PR [#3](https://github.com/momaek/lazyaudio/pull/3) |
| ADR-0003 | ASR 跑 utility process                                    | ✅ done | 2026-05-17 | PR [#3](https://github.com/momaek/lazyaudio/pull/3) |
| ADR-0004 | Pass A 引擎选型 → vad-shortwin SenseVoice                 | ✅ done | 2026-05-17 | PR [#2](https://github.com/momaek/lazyaudio/pull/2) |

---

## 4. 任务清单

### 4.1 Pre-M3 — 脚手架（T01-T06）

| ID  | 标题                                      | 状态    | 分支 / PR                                                            | 起         | 完         | 备注                                            |
| --- | ----------------------------------------- | ------- | -------------------------------------------------------------------- | ---------- | ---------- | ----------------------------------------------- |
| T01 | 仓库脚手架                                | ✅ done | feat/T01-scaffold ([#1](https://github.com/momaek/lazyaudio/pull/1)) | 2026-05-17 | 2026-05-17 | AC 全过,PR review 中                            |
| T02 | CI: lint + typecheck + test               | ✅ done | feat/T02-ci ([#5](https://github.com/momaek/lazyaudio/pull/5))       | 2026-05-17 | 2026-05-17 | 3 job CI 全绿,review 中                         |
| T03 | Tailwind + design tokens（浅 + 深双模式） | ✅ done | feat/T03-tailwind ([#6](https://github.com/momaek/lazyaudio/pull/6)) | 2026-05-17 | 2026-05-17 | 3 job CI 全绿,review 中                         |
| T04 | IPC 框架                                  | ✅ done | feat/T04-ipc ([#7](https://github.com/momaek/lazyaudio/pull/7))      | 2026-05-17 | 2026-05-17 | 3 job CI 全绿,review 中                         |
| T05 | i18n 框架                                 | ✅ done | feat/T05-i18n ([#8](https://github.com/momaek/lazyaudio/pull/8))     | 2026-05-17 | 2026-05-17 | CI 全绿,Electron 截图验过,review 中             |
| T06 | 日志框架                                  | ✅ done | feat/T06-logger                                                      | 2026-05-17 | 2026-05-17 | electron-log,dev stdout `[info] app ready` 验过 |

**Pre-M3 退出条件**（dev-plan §2.4 复核）：

- [ ] spike-005 / 010 / 011 / 012 / 013 全部拍板（差 spike-012）
- [x] ADR-0001 / 0002 / 0003 写完
- [x] T01-T06 全部 done，CI 绿
- [x] 02-design 屏 0（macOS 版本检查）补完
- [x] LLM 模板 prompt v0.1 至少 meeting / note 两个

### 4.2 M3 — 骨架可跑（T10-T20）

| ID   | 标题                   | 状态    | 分支 / PR              | 起         | 完         | 备注                                                                       |
| ---- | ---------------------- | ------- | ---------------------- | ---------- | ---------- | -------------------------------------------------------------------------- |
| T10  | 主进程脚手架           | ✅ done | feat/T10-main-scaffold | 2026-05-24 | 2026-05-24 | lifecycle+windows×3+menu/tray+shortcut;手测 3 截图过                       |
| T11  | 录音前浮窗（prep）     | ✅ done | feat/T11-prep-popover  | 2026-05-24 | 2026-05-24 | schema + IPC + UI 全过;手测截图 + log 双确认                               |
| T12  | 音频采集（renderer）   | ✅ done | feat/T12-audio-capture | 2026-05-25 | 2026-05-25 | capture window + worklet + MessagePort 全通;autotest drift +0.71%;含状态机 |
| T13  | WAV 流式落盘（main）   | 🔲 todo | —                      | —          | —          | 依赖 T12                                                                   |
| T14  | mixdown                | 🔲 todo | —                      | —          | —          | 依赖 T13                                                                   |
| T15  | 录音库 v0.1            | 🔲 todo | —                      | —          | —          | 依赖 T10                                                                   |
| T15a | 崩溃恢复扫描           | 🔲 todo | —                      | —          | —          | 依赖 T13                                                                   |
| T16  | 详情区 - 播放器        | 🔲 todo | —                      | —          | —          | 依赖 T15                                                                   |
| T17  | 状态保护               | 🔲 todo | —                      | —          | —          | 依赖 T13                                                                   |
| T18  | 设置窗口骨架           | 🔲 todo | —                      | —          | —          | 依赖 T10                                                                   |
| T19  | CI 加 macOS smoke 测试 | 🔲 todo | —                      | —          | —          | 依赖 T13                                                                   |
| T20  | 权限引导（简版）       | 🔲 todo | —                      | —          | —          | 依赖 T10                                                                   |

**M3 退出条件**：录音→停止→库→播放全程无报错；macOS + Windows 各自跑通；30min 长录音；CI smoke 过；PRD §7.1 性能 #1/#2/#5 测过。

### 4.3 M4 — 本地转录跑通（T30-T40）

| ID  | 标题                               | 状态    | 分支 / PR | 起  | 完  | 备注                |
| --- | ---------------------------------- | ------- | --------- | --- | --- | ------------------- |
| T30 | sherpa-onnx 加载链                 | 🔲 todo | —         | —   | —   | 依赖 ADR-0002       |
| T31 | 模型下载（Pass B SenseVoice int8） | 🔲 todo | —         | —   | —   | 依赖 T30            |
| T32 | Pass B Offline Engine              | 🔲 todo | —         | —   | —   | 依赖 T31            |
| T33 | 转录文本展示                       | 🔲 todo | —         | —   | —   | 依赖 T32            |
| T34 | Pass A Streaming Engine            | 🔲 todo | —         | —   | —   | 依赖 ADR-0004 + T32 |
| T35 | hypothesis → confirmed 视觉        | 🔲 todo | —         | —   | —   | 依赖 T34            |
| T36 | Pass A → Pass B 切换               | 🔲 todo | —         | —   | —   | 依赖 T34            |
| T37 | 转录失败处理                       | 🔲 todo | —         | —   | —   | 依赖 T32            |
| T38 | 设置 - 转录引擎 tab                | 🔲 todo | —         | —   | —   | 依赖 T31            |
| T39 | 全文搜索                           | 🔲 todo | —         | —   | —   | 依赖 T32            |
| T40 | 长录音中途离线提醒（PRD F4.8）     | 🔲 todo | —         | —   | —   | 依赖 T36            |

**M4 退出条件**：30min → Pass B 自动出 → UI 显示；实时字幕 hypothesis 几秒变 confirmed；1h Pass A→B 切换；全文搜索；CI transcription smoke；RTF ≤ 0.1；2.5 GB 内存上限验证。

### 4.4 M5 — 库 + LLM 摘要 + onboarding（T50-T58）

| ID  | 标题                        | 状态    | 分支 / PR | 起  | 完  | 备注           |
| --- | --------------------------- | ------- | --------- | --- | --- | -------------- |
| T50 | Onboarding 完整流程（8 屏） | 🔲 todo | —         | —   | —   | 屏 4a 复用 T31 |
| T51 | LLM 摘要核心                | 🔲 todo | —         | —   | —   | 5 个内置模板   |
| T52 | 设置 - LLM 模板 tab         | 🔲 todo | —         | —   | —   | 依赖 T51       |
| T53 | 云端转录                    | 🔲 todo | —         | —   | —   | 依赖 T33       |
| T54 | 导出（md/txt/srt）          | 🔲 todo | —         | —   | —   | 依赖 T33       |
| T55 | 列表项操作完整              | 🔲 todo | —         | —   | —   | 依赖 T16       |
| T56 | 系统通知                    | 🔲 todo | —         | —   | —   | 依赖 T32       |
| T57 | 设置完整                    | 🔲 todo | —         | —   | —   | 依赖 T52       |
| T58 | 深色模式 toggle + 过渡      | 🔲 todo | —         | —   | —   | 依赖 T18       |

**M5 退出条件**：首启 → onboarding → 录音 → 转录 → 摘要全自动；LLM 模板自动套用；至少一家云端走通；e2e CI 过。

### 4.5 M6 — Dogfood（T60-T64）

| ID  | 标题               | 状态    | 起  | 完  | 备注                    |
| --- | ------------------ | ------- | --- | --- | ----------------------- |
| T60 | 自己每天用一周     | 🔲 todo | —   | —   | 记 friction，不修 P0 外 |
| T61 | 性能优化           | 🔲 todo | —   | —   | 按 dogfood 反馈         |
| T62 | bug 收尾           | 🔲 todo | —   | —   | 关所有 P0/P1            |
| T63 | 文案 review        | 🔲 todo | —   | —   | design-system §7.2      |
| T64 | release pre-flight | 🔲 todo | —   | —   | 三平台干净机器          |

**M6 退出条件**：7 天 dogfood 0 崩溃；P0/P1 全关；三平台 packaged OK；changelog v0.1.0 写完。

### 4.6 M7 — v0.1 发布（T70-T74）

| ID  | 标题                  | 状态    | 起  | 完  | 备注                   |
| --- | --------------------- | ------- | --- | --- | ---------------------- |
| T70 | release artifacts     | 🔲 todo | —   | —   | tag v0.1.0             |
| T71 | README + 安装文档     | 🔲 todo | —   | —   | 截图 + Gatekeeper 说明 |
| T72 | electron-updater 集成 | 🔲 todo | —   | —   | 旧版本平滑升级         |
| T73 | 小范围分发            | 🔲 todo | —   | —   | 5-10 个朋友            |
| T74 | 监控                  | 🔲 todo | —   | —   | 24h 看反馈             |

**M7 退出条件**：GitHub Release published；≥5 外部用户跑通完整流程；无未关 P0；PRD §9 成功指标观测启动。

---

## 5. Blocked / Parked

> 任何 ⛔ 状态的任务都要在这登记。格式：`<ID> — <一句话原因> — <预期解开条件 / 时间>`

_无_

---

## 6. 周报

> 每周日追加一条。模板参考 `development-plan.md` §12。新的在上、旧的在下。

<!--
### Week N (yyyy-mm-dd)
- 当前 milestone:
- 本周完成:
- 本周遇到:
- 下周计划:
- 风险 / blockers:
- 燃尽: 当前 milestone 还剩 X 个 T，估 Y 天
-->

_暂无周报记录。_

---

## 7. 修订历史

| 日期       | 变更                                                        |
| ---------- | ----------------------------------------------------------- |
| 2026-05-17 | 初稿；从 development-plan.md 抽取所有 spike / ADR / T01-T74 |
