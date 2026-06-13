# 开发进度（live）

> **最后更新**：2026-06-10
> **当前里程碑**：M5（库 + LLM 摘要 + onboarding）
> **当前焦点**：M5 收尾中。T50-T57 全部 ✅(T53-T57 真机手测过;手测中修的 3 处 bug 已随 PR #46 合并)。**🔄 T58 深色模式**:代码已随 PR #47 合并,仍待真机 visual review(四窗 + 无闪烁)后对账。**🔄 T61a Pass A 中英混合实时调优**(feat/T61-pass-a-tuning):因 2026-06-08 dogfood 发现中英文混合实时转录不理想,先做第一刀:首个 hypothesis 延后到 ≥2s、VAD/短窗参数抽取、raw tag/耗时安全 debug、不记录正文;typecheck/test 105/lint 净(仅既有 i18n warning),待真机 A/B。跨里程碑遗留:**T15a 崩溃恢复**(🔄 需 SIGKILL 手测)、**spike-012 1h 压测**(硬件受限,仅 M2)、**T41 Pass A 渐进精修**(候选)。
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
| 总任务（T + spike + ADR） | 4 + 9 + 4 = 17（pre-M3）/ 45 (M3-M7 T) = **62** |
| ✅ done                   | 50                                              |
| 🔄 wip                    | 3（T15a,T58,T61a）                              |
| ⛔ blocked                | 0                                               |
| 🔲 todo                   | 14                                              |
| 本周燃尽                  | —                                               |

---

## 1. 当前焦点（Active）

> 同时不超过 2-3 项。空着也行，表示在选下一个任务。

- [ ] T58 深色模式 toggle + 过渡（feat/T58-dark-mode）
  - [x] 跟随系统 / 强制浅 / 强制深 三选（设置→通用，T18 已有 toggle；本任务接全 app 应用）
  - [ ] 切换 150ms 过渡（无闪烁）— 代码就绪（.theme-switching 仅切换瞬间生效）；验证：**待真机手测**
  - [ ] 全屏 visual review：四窗（main/settings/onboarding/prep）切深浅正常，红点/类型徽章对比足够；验证：**待真机手测**
- [ ] T61a Pass A 中英混合实时调优（feat/T61-pass-a-tuning）
  - [x] 首个 hypothesis 延后到 ≥2s，避免过短音频触发语言判断乱跳；验证：`pnpm vitest run` 105 tests passed（含新增短音频不出 hypothesis + 攒够 ≥2s 出第一版）
  - [x] VAD/短窗参数集中到 `DEFAULT_VAD_STREAM_OPTIONS`，便于后续 dogfood A/B；验证：`pnpm typecheck` 通过
  - [x] 增加 raw SenseVoice tags / audioMs / recognizeMs / cleanChars 安全 debug，不记录正文；验证：`pnpm typecheck` 通过
  - [ ] 真机 A/B：用 2026-06-08 中英混合 dogfood 场景复测 realtime 体感和 debug tags
- [ ] T15a 崩溃恢复扫描：录音中异常退出后，重启可在库里看到 partial 录音
  - 验证：待跑手测 SIGKILL / 自动化可行时补日志
- [ ] T15a 崩溃恢复扫描：未关闭 WAV header 按真实文件大小修正，已落盘部分可播放
  - 验证：待跑手测 / 单测
- [ ] T15a 崩溃恢复扫描：meta.json.tmp 不残留
  - 验证：待跑手测 / 单测

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

| ID   | 标题                    | 状态    | 分支 / PR                                                                                                                              | 起         | 完         | 备注                                                                                                                                                   |
| ---- | ----------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T10  | 主进程脚手架            | ✅ done | feat/T10-main-scaffold                                                                                                                 | 2026-05-24 | 2026-05-24 | lifecycle+windows×3+menu/tray+shortcut;手测 3 截图过                                                                                                   |
| T11  | 录音前浮窗（prep）      | ✅ done | feat/T11-prep-popover                                                                                                                  | 2026-05-24 | 2026-05-24 | schema + IPC + UI 全过;手测截图 + log 双确认                                                                                                           |
| T12  | 音频采集（renderer）    | ✅ done | feat/T12-audio-capture                                                                                                                 | 2026-05-25 | 2026-05-25 | capture window + worklet + MessagePort 全通;autotest drift +0.71%;含状态机                                                                             |
| T13  | WAV 流式落盘（main）    | ✅ done | feat/T13-wav-writer ([#21](https://github.com/momaek/lazyaudio/pull/21))                                                               | 2026-05-25 | 2026-05-25 | WavStreamWriter + RecordingSession;30s flush;autotest mic+sys wav 可播                                                                                 |
| T14  | mixdown                 | ✅ done | feat/T14-mixdown                                                                                                                       | 2026-05-26 | 2026-05-26 | 离线合成 mixed.wav;独立 mixStatus 不阻塞主 status;autotest mixed.wav 1.8MB 可播                                                                        |
| T15  | 录音库 v0.1             | ✅ done | main `4294789`                                                                                                                         | 2026-05-27 | 2026-05-27 | library:list + 主窗口左侧列表;typecheck/lint/test 通过;随修复录音浮窗一并直推                                                                          |
| T15a | 崩溃恢复扫描            | 🔄 wip  | —                                                                                                                                      | 2026-05-27 | —          | 依赖 T13                                                                                                                                               |
| T16  | 详情区 - 播放器         | ✅ done | feat/T16-player ([#25](https://github.com/momaek/lazyaudio/pull/25))                                                                   | 2026-05-28 | 2026-05-28 | Player(play/pause/波形seek/±15s)+ lazyaudio-media:// 流式协议(media-src CSP);手测截图播到末尾确认                                                      |
| T16a | 录音中状态 UI（最小版） | ✅ done | feat/T16a-recording-ui ([#24](https://github.com/momaek/lazyaudio/pull/24))                                                            | 2026-05-28 | 2026-05-30 | state-changed 广播 + 录音中横条 + 置顶列表项;停止并保存手测过(权限通后);不含暂停/电平表/波形                                                           |
| T17  | 状态保护                | ✅ done | feat/T17-state-protection ([#28](https://github.com/momaek/lazyaudio/pull/28)) + ⌘W [#32](https://github.com/momaek/lazyaudio/pull/32) | 2026-05-29 | 2026-05-30 | close→最小化/退出 + 退出确认 dialog + capture崩溃→partial;decideCloseAction 单测过;⌘W/killall/退出弹窗 真手测全过(权限通后);⌘W 补 Window 菜单 close 项 |
| T18  | 设置窗口骨架            | ✅ done | feat/T18-settings ([#26](https://github.com/momaek/lazyaudio/pull/26))                                                                 | 2026-05-29 | 2026-05-29 | settings-store(原子持久化)+ safeStorage 预留 + 通用/快捷键 tab;改快捷键 live re-register;AC 两半各有单测(reload roundtrip + applyEffects)              |
| T19  | CI 加 macOS smoke 测试  | ✅ done | feat/T19-ci-mac-smoke ([#31](https://github.com/momaek/lazyaudio/pull/31))                                                             | 2026-05-29 | 2026-05-29 | build-mac(arm64) build+test+启动 smoke 全绿(28s);x64 runner 排不到 + 签名公证/录PCM 移 T70                                                             |
| T20  | 权限引导（简版）        | ✅ done | feat/T20-permissions ([#29](https://github.com/momaek/lazyaudio/pull/29))                                                              | 2026-05-29 | 2026-05-30 | 麦克风权限检测 + record:start gate(D5 dialog + 打开系统设置 deep link)+ permission IPC;纯判定单测过;无权限 mac 弹窗/跳转真手测过                       |

**M3 退出条件**：录音→停止→库→播放全程无报错；macOS + Windows 各自跑通；30min 长录音；CI smoke 过；PRD §7.1 性能 #1/#2/#5 测过。

### 4.3 M4 — 本地转录跑通（T30-T40）

| ID  | 标题                               | 状态    | 分支 / PR                                                                    | 起         | 完         | 备注                                                                                                                                                                                                                                                                                        |
| --- | ---------------------------------- | ------- | ---------------------------------------------------------------------------- | ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T30 | sherpa-onnx 加载链                 | ✅ done | feat/T30-sherpa-loader ([#33](https://github.com/momaek/lazyaudio/pull/33))  | 2026-05-30 | 2026-05-30 | ADR-0002 落地:utility require + @loader_path afterPack 改写;dev + ad-hoc packaged require('sherpa-onnx-node') 验过(otool 全 @loader_path);spctl 公证 gate T70                                                                                                                               |
| T31 | 模型下载（Pass B SenseVoice int8） | ✅ done | feat/T31-model-download ([#34](https://github.com/momaek/lazyaudio/pull/34)) | 2026-05-30 | 2026-05-30 | downloader(Range续传/双源fallback/HEAD测速)+verify(sha256)+manifest+设置「转录引擎」最小模型管理(列表/下载进度/删除);registry 用真实值(int8-2025-09-09);真源下载 237115547B sha256 命中(hf-mirror)+huggingface 同字节(Range 206 验过);20 单测;UI 最小版,本地/云端切换等留 T38               |
| T32 | Pass B Offline Engine              | ✅ done | feat/M4-transcription ([#35](https://github.com/momaek/lazyaudio/pull/35))   | 2026-05-31 | 2026-05-31 | utility 跑 SenseVoice OfflineRecognizer(定窗 15s 切片,VAD 分段留 T34)+ wav-read(48k stereo→16k mono)+ orchestrator(record:stop→mixdown→串行队列→写 transcript.json + meta.transcribe)。M2 实测识别可跑(zh.wav 90ms);我的 DSP 路径产样本与 sherpa 完全一致并识别同文本。GUI 端到端手测待用户 |
| T33 | 转录文本展示                       | ✅ done | feat/M4-transcription ([#35](https://github.com/momaek/lazyaudio/pull/35))   | 2026-05-31 | 2026-05-31 | TranscriptPanel(段落列表 + 时间戳点击跳播 + 当前段高亮 + speaker 调色)接进详情区;Player 暴露 seek/onTime 桥接。GUI 手测待用户                                                                                                                                                               |
| T34 | Pass A Streaming Engine            | ✅ done | feat/M4-passa ([#36](https://github.com/momaek/lazyaudio/pull/36))           | 2026-05-31 | 2026-05-31 | Silero VAD 切片 + 复用 SenseVoice(ADR-0004);streaming-asr utility(vad-stream:confirmed=VAD 闭合段、hypothesis=尾部 15s 滑窗 0.8s 间隔)+ pcm-fork(receiver tap→48k→16k mono→mic+sys 合一路)+ orchestrator startLive。POC 实测真录音出 hypothesis→confirmed 锚点稳定。GUI 手测待用户          |
| T35 | hypothesis → confirmed 视觉        | ✅ done | feat/M4-passa ([#36](https://github.com/momaek/lazyaudio/pull/36))           | 2026-05-31 | 2026-05-31 | TranscriptPanel live 模式:hypothesis 灰斜体、confirmed 正常,key=segmentId 原地替换不跳行(spike-013);200ms 颜色过渡;Pass B 覆盖后 ✓ 离线精修。录音中详情区嵌实时面板。GUI 手测待用户                                                                                                         |
| T36 | Pass A → Pass B 切换               | ✅ done | feat/M4-passa ([#36](https://github.com/momaek/lazyaudio/pull/36))           | 2026-05-31 | 2026-05-31 | record:stop → stopLive(flush+等 flushed≤5s+kill)与 mixdown 并行,都完成才 fork Pass B(串行,守 2.5GB);Pass B done 广播 offline-overwrite 整体换 transcript.json。GUI 手测待用户                                                                                                               |
| T37 | 转录失败处理                       | ✅ done | feat/M4-transcription ([#35](https://github.com/momaek/lazyaudio/pull/35))   | 2026-05-31 | 2026-05-31 | utility 退出/识别失败/模型缺失 → meta.transcribe failed + 广播 → 面板显示失败 + [重试];model-missing 提示去设置下载。自动重启 3 次留后续(当前单次 + 手动重试)。GUI 手测待用户                                                                                                               |
| T38 | 设置 - 转录引擎 tab                | ✅ done | feat/M4-transcription ([#35](https://github.com/momaek/lazyaudio/pull/35))   | 2026-05-31 | 2026-05-31 | 本地/云端 Segmented(云端占位)+ 模型管理(复用 T31)+ 磁盘占用统计。高级 section(线程/provider,需 settings schema)留后续。GUI 手测待用户                                                                                                                                                       |
| T39 | 全文搜索                           | ✅ done | feat/M4-transcription ([#35](https://github.com/momaek/lazyaudio/pull/35))   | 2026-05-31 | 2026-05-31 | 搜索框 debounce → transcribe:search 扫所有 transcript.json substring 命中 → 结果列表 → 点击选中录音。段内 seek 留后续。GUI 手测待用户                                                                                                                                                       |
| T40 | 长录音中途离线提醒（PRD F4.8）     | ✅ done | feat/M4-passa ([#36](https://github.com/momaek/lazyaudio/pull/36))           | 2026-05-31 | 2026-05-31 | 最小版:录音中每满 10min 详情区顶部 banner「停录可生成离线精修」+ 关闭,点=停录走完整 Pass B。完整 F4.8(>6GB 检测 + 不停录增量覆盖)留后续。GUI 手测待用户                                                                                                                                     |

**M4 退出条件**：30min → Pass B 自动出 → UI 显示；实时字幕 hypothesis 几秒变 confirmed；1h Pass A→B 切换；全文搜索；CI transcription smoke；RTF ≤ 0.1；2.5 GB 内存上限验证。

### 4.4 M5 — 库 + LLM 摘要 + onboarding（T50-T58）

| ID  | 标题                        | 状态    | 分支 / PR                                                                                                                                 | 起         | 完         | 备注                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | --------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T50 | Onboarding 完整流程（8 屏） | ✅ done | feat/T50-onboarding ([#38](https://github.com/momaek/lazyaudio/pull/38)) + smoke fix ([#39](https://github.com/momaek/lazyaudio/pull/39)) | 2026-06-01 | 2026-06-01 | 完整 8 屏 onboarding + smoke 模式强制退出;屏 4a 复用 T31                                                                                                                                                                                                                                                                                                                                                                                          |
| T51 | LLM 摘要核心                | ✅ done | feat/M5-summary ([#37](https://github.com/momaek/lazyaudio/pull/37))                                                                      | 2026-05-31 | 2026-05-31 | SummarizerFacade + OpenAI 兼容 SSE 流式 client + 5 内置模板(meeting/note 照文档,interview-\*/lecture 新写)+ 输入组装(speaker/时间戳/sysmeta/截断)+ 摘要面板(react-markdown,可点 [HH:MM:SS] 跳播)+ 云端配置表单(base/key 密文/model/测连接)+ meta.summary;手动按钮 + 转录完自动。本地 SSE server 测过流式/401/endpoint;真 LLM 端到端待用户(需 key)。map-reduce/checkbox 写回留后续                                                                 |
| T52 | 设置 - LLM 模板 tab         | ✅ done | feat/T52-llm-templates ([#42](https://github.com/momaek/lazyaudio/pull/42))                                                               | 2026-06-01 | 2026-06-01 | 5 模板列表 + prompt 编辑 + sessionType→templateId 映射;已合 main(commit 8b60d80);GUI 手测过                                                                                                                                                                                                                                                                                                                                                       |
| T53 | 云端转录                    | ✅ done | feat/T53-cloud-transcribe ([#43](https://github.com/momaek/lazyaudio/pull/43))                                                            | 2026-06-03 | 2026-06-07 | OpenAI 兼容 Audio API(`/audio/transcriptions` multipart 直传 WAV,verbose_json,429/5xx 退避×3)+ 编排器按 privacyMode 路由 Pass B(engine `openai-compatible`)+ 云端模式禁 Pass A(F4.9)+ settings.cloud.transcribeModel + 设置页本地/云端切换接 privacyMode + 转录模型输入。按「远端处理任意大小」直传,不引 ffmpeg/不切片。7 单测(本地 http server 端到端)+ 全量 89 过。**真机手测过**;切换未配置弹提示留 T57                                        |
| T54 | 导出（md/txt/srt）          | ✅ done | feat/T54-export ([#44](https://github.com/momaek/lazyaudio/pull/44))                                                                      | 2026-06-04 | 2026-06-07 | export 域(IPC export:run + collect + 纯函数生成器 format.ts)：md=元信息+摘要+转录(行内[HH:MM:SS]) / txt=元信息+摘要+纯文本 / srt=标准 `HH:MM:SS,mmm` 时间轴；main 弹 save dialog 落盘；详情头临时「导出」按钮(md/txt/srt 小菜单),T55 的 ⋯ 菜单上线后接管。10 单测(SRT 精确字节 + md/txt 结构 + 时间戳四舍五入)+ 全量 99 过。**真机手测过**(dialog 落盘 + 三种文件打开)                                                                            |
| T55 | 列表项操作完整              | ✅ done | feat/T55-list-actions ([#45](https://github.com/momaek/lazyaudio/pull/45))                                                                | 2026-06-04 | 2026-06-07 | 列表项右键 + hover ⋯ 菜单(全 6 项)+ 双击行内重命名 + 详情头 mockup 图标组 [重转][导出][更多⋯](替掉 T54 临时导出按钮)。新增 library:rename/delete(录音中守卫)/show-in-folder IPC;重转/重摘/导出复用 T37/T51/T54;删除带 confirm。mockup(详情头按钮)↔spec(列表项 ⋯ 菜单)冲突 → 用户裁决「两边都做」。typecheck/test 99/lint 净。**真机手测过**(6 操作 + 删除确认 + Finder)                                                                           |
| T56 | 系统通知                    | ✅ done | feat/T55-list-actions ([#45](https://github.com/momaek/lazyaudio/pull/45))                                                                | 2026-06-05 | 2026-06-07 | 转录完成/失败弹 Electron Notification(主窗口聚焦时不打扰);点通知 → showMainWindow + library:activate → renderer 选中该录音。typecheck/test 99/lint 净。**真机手测过**;**合并在 PR #45**                                                                                                                                                                                                                                                           |
| T57 | 设置完整                    | ✅ done | feat/T55-list-actions ([#45](https://github.com/momaek/lazyaudio/pull/45))                                                                | 2026-06-05 | 2026-06-07 | 录音/隐私/关于三 tab(可生效子集):保存目录可改(真生效)/Finder/录音结束自动转录(真生效)/合规开关;隐私 danger-zone(清空录音/模型/重置/完全清除,双确认+录音中守卫)+只读数据位置/Keychain+崩溃/统计灰显;关于(版本/外链/协议/致谢,检查更新灰显);退出录音中 tray 变灰。采样率/分轨/命名等持久化标「录制时生效」。typecheck/test 99/lint 净。**真机手测过**;**合并在 PR #45**。手测中修了 3 处 bug(转录自动滚动 + 设置 partial 覆盖 + 卡片裁行),见 PR #46 |
| T58 | 深色模式 toggle + 过渡      | 🔄 wip  | feat/T58-dark-mode                                                                                                                        | 2026-06-07 | —          | 三选 toggle(设置→通用)T18 已有;本任务做全 app 应用 + 过渡:main 把 theme 写 nativeTheme.themeSource → 各窗口 prefers-color-scheme 联动,共享 initTheme() 切 .dark(main/settings/onboarding/prep 四窗 + 启动即应用);切换瞬间 .theme-switching 给 150ms 过渡(不影响日常交互/开窗不闪/reduced-motion 跳过)。typecheck/test 102/lint 净。**待真机手测**(四窗切深浅 + 跟随系统 + 全屏 visual review 红点/徽章对比 + 切换无闪烁)                          |

**M5 退出条件**：首启 → onboarding → 录音 → 转录 → 摘要全自动；LLM 模板自动套用；至少一家云端走通；e2e CI 过。

### 4.5 M6 — Dogfood（T60-T64）

| ID  | 标题               | 状态    | 起         | 完  | 备注                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------ | ------- | ---------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T60 | 自己每天用一周     | 🔲 todo | —          | —   | 记 friction，不修 P0 外                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| T61 | 性能优化           | 🔄 wip  | 2026-06-08 | —   | 因 dogfood 发现中英混合实时转录不理想,先做 T61a(feat/T61-pass-a-tuning):首个 hypothesis 延后 ≥2s + VAD/短窗参数抽取 + raw tags/耗时安全 debug;待真机 A/B。**评测基建**(PR #48):`scripts/eval-transcribe-fixtures.ts`(CER/术语/RTF/RSS,复用 workers/asr 链;m4a 经 ffmpeg + srt 当 ref + `--dump-hyp`)+ `fixtures/transcribe/` + Pass A 埋点(`passa-metrics.ts`,env 开关默认 no-op)。**尺子校准**(PR #52,feat/T61-passa-eval):视频字幕参考稿是精修非逐字(书面数字 + 删语气词),CER 默认对称归一(数字归一 `--no-norm-num` 关 / 语气词剥除 `--keep-fillers` 关),挤掉 ~2.1 点假错 → **校准基线 15.4%**(kunyuan 4.4% 引擎够好 / 圆桌 ~13.5% 多人上限 / lisa 17.6% 英文名 / trump 28.2% 真漏转)。同支新增 **`--pass-a` 实时模拟**(切块喂真实 VadStream 算 confirmed CER):Pass A 21.4% vs Pass B 17.5%(同口径,符合「实时草稿+离线精修」);⚠️ Pass A eval 中 RSS 峰 4477MB + RTF 随样本递增,疑 sherpa OfflineStream `createStream` 不释放,**长录音泄漏待查**。**否决的路**:Pass B VAD 分段(PR #49,CER +0.9)/ 流式 zh-zipformer + 热词(spike/online-zh-hotwords,16.2 vs 15.4 且热词对 byte-fallback 字失效);均见 tech-feasibility。下一步 P1 术语表后处理。优化本体仍待 M6 dogfood 触发 |
| T62 | bug 收尾           | 🔲 todo | —          | —   | 关所有 P0/P1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| T63 | 文案 review        | 🔲 todo | —          | —   | design-system §7.2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| T64 | release pre-flight | 🔲 todo | —          | —   | 三平台干净机器                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

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

| 日期       | 变更                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-03 | development-plan.md §6.2 新增 T61 转录效果与实时转录优化专项 spec，并补充实时音频增强与基础优化工具清单：原始音频落盘不破坏、ASR 副本轻量增强、质量检测、noise gate/AGC A/B、mic/system 二次收录风险、AudioQualityMonitor、TypedArray DSP metrics、eval fixture、重型增强留给 Pass B/P2；progress T61 备注同步指向该 spec。                                                                                                                              |
| 2026-06-01 | T52 设置 - LLM 模板 tab wip(feat/T52-llm-templates):summary 模板 IPC(list/set/reset)+ settings.templates 覆盖持久化 + pickTemplate 读用户映射 + 设置页模板列表/prompt 编辑/sessionType chip/恢复默认;typecheck/test/lint 已过;待 GUI 手测，再开 PR 转 done                                                                                                                                                                                               |
| 2026-05-31 | M5 起步:T51 LLM 摘要核心 done(feat/M5-summary):SummarizerFacade + OpenAI 兼容 SSE 流式 + 5 内置模板(meeting/note 照 llm-templates.md,interview-as-interviewer/candidate + lecture 新写,§0 表标 ✅)+ settings.cloud(safeStorage 密钥)+ 摘要面板(react-markdown)+ 自动/手动触发;71 单测(含本地 SSE server 端到端)。真 LLM 端到端待用户配 key                                                                                                               |
| 2026-05-31 | M4 Pass A 实时 done(T34/35/36/T40 最小版,feat/M4-passa):Silero VAD(进 registry,github 单源)切片 + 复用 SenseVoice;streaming-asr utility(hypothesis 尾部 15s 滑窗 + confirmed VAD 闭合段,同 segmentId 原地替换)+ pcm-fork(receiver tap 48k→16k mono mic+sys 合一路)+ Pass A→B 串行切换(守 2.5GB)+ live UI 灰斜体 hypothesis + T40 banner。POC 真录音验过。simplifications:mic+sys 合一路 speaker=mixed、T40 最小版、hypothesis 重识别滑窗(POC RTF~0.36)。 |
| 2026-05-31 | M4 核心转录闭环 done(T32/T33/T37/T38/T39,单条 feat/M4-transcription):utility SenseVoice 定窗识别 + transcript.json + 详情区面板 + 失败重试 + 引擎设置本地/云端 + 全文搜索;M2 arm64 实测识别可跑。Pass A 实时(T34/35/36/40)留第二批。simplifications:定窗(非 VAD)分段、失败单次(非 3x 自动重试)、高级 section/段内 seek 留后续                                                                                                                            |
| 2026-05-30 | T31 模型下载 done;订正 transcription-pipeline.md §5.1 registry 为真实值(原占位符 + int8 在独立 repo `...-int8-2025-09-09`,非 fp32 repo)、§5.3 源收敛 hf-mirror+huggingface 双单文件源(GitHub 整包/ModelScope 不接)、§5.4 断点元数据改「partial 文件即进度」                                                                                                                                                                                              |
| 2026-05-29 | PR #30:Electron 基线 35→42(修系统音误索屏幕权限,订正 ADR-0001 / tech-feasibility §R1 版本假设)+ 主窗口空状态补「开始录音」按钮(§6.2)+ T17 非录音退出修复 + dev ad-hoc 签名 hook                                                                                                                                                                                                                                                                          |
| 2026-05-17 | 初稿；从 development-plan.md 抽取所有 spike / ADR / T01-T74                                                                                                                                                                                                                                                                                                                                                                                              |
