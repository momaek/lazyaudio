# 03-architecture 完成标记

**完成日期**：2026-05-16
**状态**：v0.1-draft 阶段文档齐备 + 三轮 review 修订完成 + Multi Pass scope 纳入 v0.1 P0；进入 `04-development` 前需跑 spike-011/012/013 拍板 Pass A 引擎
**修订**：
- 2026-05-16 r2 — 应用了 review r1 的 A/B/C/D 类修订
- 2026-05-17 r3 — 应用了 review r2 的 17 条遗留 / 新引入问题修订
- 2026-05-17 r4 — 应用了 review r3 的 9 条遗留（A1-A5 + B1-B4）
- 2026-05-17 r5 — **Multi Pass 实时转录纳入 v0.1 P0**，跨 01/02/03 三层 doc 骨架同步（spike 数据回灌前先固化决策与接口）
- 2026-05-17 r4 — 应用了 review r3 的 9 条小修订（详见下方"r4 修订"）

---

## 已交付文档

| 文档 | 说明 |
|---|---|
| [`overview.md`](./overview.md) | 进程拓扑、模块划分、关键数据流、i18n 选型、dev vs packaged 差异表、待写 ADR |
| [`audio-capture.md`](./audio-capture.md) | 系统音 / 麦克风采集、AudioWorklet PCM、MessagePort IPC、WAV 流式落盘 + 周期 header flush、外部事件状态机、混音 |
| [`data-model.md`](./data-model.md) | 目录布局、meta / transcript / settings / templates / models 字段、安装 ID、safeStorage、Schema 版本化 |
| [`transcription-pipeline.md`](./transcription-pipeline.md) | TranscribeEngine + SummarizerFacade 抽象、sherpa-onnx in utility 自带 loader 守卫、模型镜像 fallback、持久化队列 |
| [`ipc-contract.md`](./ipc-contract.md) | 全 IPC 通道、命令 / 事件 / MessagePort、错误编码、preload 暴露、host 白名单算法 |

---

## 已应用修订（review r1 → r2）

**A 类（8 条必须修）**：全部已应用
- A1 utility process 自己做 loader 检查 → transcription-pipeline §3.2.1
- A2 `record:tick` 移除 levels 字段 → ipc-contract §2.2
- A3 快捷键延迟预算拆两段 → audio-capture §1.1 / §10
- A4 WAV header 30s 周期 flush → audio-capture §5.1
- A5 macOS 14.0–14.1 onboarding 屏 0 跨文档备注 → audio-capture §7.1
- A6 `lastSessionType` 字段 → data-model §3.1
- A7 utility 完全可信、放弃"路径只读"约定 → data-model §11
- A8 `record:open-prep` 拆 → `record:get-prep-defaults` + 内部 `showPrepWindow()` → ipc-contract §2.1 / §10

**B 类（14 条应该修）**：12 条应用，2 条修订
- B1 重采样器拍板 sherpa-onnx-node Resampler 优先 → transcription-pipeline §3.4
- B2 ffmpeg-static 仅云端用 + macOS 签名清单 → transcription-pipeline §4.2
- B3 mixStatus 独立子状态、status=done 不等 mixing → audio-capture §6.0
- B4 deleteRecording 等待 cancel + 5s 兜底 → data-model §9.1
- B5 持久化队列（`status=pending`）+ online 监听 → transcription-pipeline §3.7
- B6 设备热切换 / track ended 区分 → audio-capture §8.0
- B7 EngineRegistry.ensureReady() dry-run → transcription-pipeline §2.2
- B8 库索引两阶段启动、UI 不阻塞 → data-model §5.4
- B9 选 safeStorage 弃 keytar → data-model §3.2
- B10 `speaker` 改 string 类型 → data-model §4.1
- B11 `preparing` 语义澄清（writers 就绪非"等用户回车"）→ overview §4.2
- B12 隐私确认对话框由 onboarding 屏 4b 副文案承担 → transcription-pipeline §4.5
- B13 apiBaseUrl 日志二次 hash 脱敏 → data-model §8.3
- B14 系统 Sleep / 屏保唤醒入状态机 → audio-capture §8.0

**C 类（9 条 v0.x 演进）**：6 条应用 + 2 条修订接受 + 1 条删除
- C1 `SummarizerFacade` 抽象 → transcription-pipeline §6.0
- C2 `TranscribeEvent` 加 `partial-segment` 类型 → transcription-pipeline §2.1 + ipc-contract §3.2
- C3 `manifest.nativeBundles` GPU 预留 → data-model §7.1
- ~~C4 plugin / webhook stub~~ — 不做，v0.1 无需求
- C5 transcript edit 演进路径注释 → data-model §4.1（tokens 只读 + displayText 派生）
- C6 删除未用的 `tags` 字段 → data-model §2.1
- C7 `installId` 字段（sync 基础）→ data-model §3.1 / §2.1
- C8 i18n 选型 `react-i18next` → overview §6.4
- C9 `audioFiles.codec` 字段（压缩预留）→ data-model §2.1

**D 类（12 条小问题）**：11 条应用，1 条不做
- D1 路径统一 `electron/main/workers/asr/` → overview §5.2 / transcription-pipeline §3.3
- D2 IPC 日志 channel 黑名单 → data-model §8.3
- D3 `secrets:test` ping 方法 → ipc-contract §7.2
- D4 `system:notify` 通道 → ipc-contract §8
- D5 `lastBuiltAt` 字段语义 → data-model §5.2
- D6 `app.isPackaged` 分支替换 replace → transcription-pipeline §3.2
- D7 partial transcript + failed schema 占位 → data-model §4.5
- D8 host 白名单匹配算法（等值 + suffix）→ ipc-contract §8
- D9 podcast 套 note 模板 + UI 显示说明 → transcription-pipeline §6.2
- D10 `warnings.detail` `any` → `unknown` → data-model §2.1
- ~~D11 SIMD f32ToI16~~ — 不做，未到优化时机
- D12 `record:tick` debounce → throttle → ipc-contract §12

**新增章节**：
- overview §6.4 国际化（i18n）选型
- overview §7 Dev vs Packaged 差异集中表（A1 / B6 / B14 / D6 同根因的统一收纳）

---

## r3 修订（2026-05-17，应用 review r2）

**字段交叉引用断裂**：
- #4 Settings.recording.`templatePerSessionType` 字段补齐 → data-model §3.1
- #5 Settings.cloudLLM.`contextWindow` 字段补齐 → data-model §3.1
- #6 Settings.`onboarding` 段（`completedAt` + `step`）补齐 → data-model §3.1

**A1 / B8 修复落地的二次问题**：
- #7 utility loader 改为主进程通过 init 消息显式传 `platformDir`，不再靠 `__dirname` 反推 → transcription-pipeline §3.2.1
- #8 install_name_tool afterPack 脚本完整化——同时改 `-id` 和 LC_LOAD_DYLIB（otool -L 扫依赖 + `-change`），避免主 dylib 加载成功但运行时找不到 libonnxruntime → transcription-pipeline §3.2.1

**B8 索引一致性逻辑错**：
- #9 LibraryEntry 新增 `syncedAtMtime` 字段；reconcile 时按 per-entry mtime 比较，`lastBuiltAt` 仅诊断用 → data-model §5.2 / §5.4

**跨文档同步未完成**：
- #1 overview §1 / §6.3 同步两阶段延迟预算（< 100 ms / < 400 ms） → overview
- #2 overview §4.1 时序图改 `ipc: show(prefs)` 为 main 内部 `showPrepWindow()` + renderer 自调 `get-prep-defaults` → overview
- #3 overview §10 删掉 4 条已落地的"开放问题"，加划线注释指向解决位置 → overview

**实操点不清**：
- #10 prep window renderer 实例只创建一次——补"组件 mount 拉默认 + 订阅 `settings:changed` 跟随更新"约定 → ipc-contract §2.1

**文案 / 准确性**：
- #11 safeStorage 文案修正：macOS Keychain.app 会显示 `LazyAudio Safe Storage` 保护密钥条目，但用户看不到实际 API key；Windows DPAPI 无 keychain entry → data-model §3.2

**typo / 一致性**：
- #12 `onProgress` → `onEvent` 统一 → transcription-pipeline §4.1 / §3.4
- #13 audio-capture §9 行"列为 §12 开放问题" → "见 §8.0 状态机表" → audio-capture §9
- #14 spike-010 拆为两阶段 < 100 / < 400 ms → audio-capture §13
- #15 `useRecordTick` 示例去掉残留 `levels` 字段 + 加电平表 hook 注释 → ipc-contract §10
- #16 speaker 未知 → `speaker-5+` 灰色 fallback → data-model §4.1
- #17 pcm-dropouts 检测路径明确（renderer 权威，主进程透传 warning） → audio-capture §4.3

---

## r4 修订（2026-05-17，应用 review r3）

**编码时会卡的问题**：
- A1 `record:warning` 方向冲突 → 新增 `record:report-warning` invoke 通道（renderer → main），main 汇总后再广播 `record:warning` 事件（main → renderer），两份文档同步 → ipc-contract §2.1 / audio-capture §4.3
- A2 `get-prep-defaults` 返回去掉 `title` 字段，renderer 本地拼（依赖当前时刻，main 提前返回会过期） → ipc-contract §2.1
- A3 utility fork 后 `await child.once('spawn')` 再 postMessage——避免 init 消息被丢弃导致 utility 卡死 → transcription-pipeline §3.2.1
- A4 afterPack hook 在 `install_name_tool` 改完后**必须 codesign 重签**——Mach-O header 改动让原签名失效，公证 100% 挂 → transcription-pipeline §3.2.1
- A5 `skipPrepPopover=true` 入口路径补：globalShortcut 直接调 `orchestrator.start()`，不走 `record:start` IPC；与 prep renderer 路径复用同一个 entry → ipc-contract §2.1

**小问题**：
- B1 ipc-contract §2.1 表格被 blockquote 切断 → blockquote 移到表格下方
- B2 `Settings.onboarding.step` 从 `string` 改为 `OnboardingStep` union（9 个值） → data-model §3.1
- B3 utility 入口注明 CommonJS（与 sherpa-onnx-node CJS 兼容，避免 dual-package 陷阱） → transcription-pipeline §3.2.1
- B4 overview §4.1 时序图箭头方向：把 `prep .show()` 的反向箭头去掉，改为"main 内部副作用，无 IPC" → overview §4.1

---

## r5 修订（2026-05-17，Multi Pass 实时转录纳入 v0.1 P0）

**触发**：MVP 必须有实时转录；离线高精度转录覆盖（PRD F4.6–F4.9）

**关键决策**（双轨：doc 骨架现在写 + spike 并行跑）：
- **Pass A**（streaming，录音中）+ **Pass B**（offline，录音 stop 后）双引擎，独立 facade
- **两个 utility process** 不长期共存——Pass A unload 后 Pass B 才 fork；中途增量 Pass B 仅当内存 > 6GB 允许
- **transcript 双文件**：`transcript.live.json` + `transcript.json` 共存（live 保留供调试，UI 默认读 offline）
- **PRD §7.1 内存上限 1.5 GB → 2.5 GB**（接受 Multi Pass 资源代价）
- **云端模式默认禁用 Pass A**，用户主动开启时 UI 显式告警
- **10/20/30 分钟提醒 banner**：状态条下方 info banner，"跑离线" / "稍后" 二选；不中断录音

**doc 骨架同步范围**：

| 层 | 文档 | 改动 |
|---|---|---|
| 01 | prd.md §1.3 / §4.1 / §4.3 / §7.1 / §11 / 变更记录 | 增 F4.6–F4.9；§4.3 删除"实时流式"；内存上限 2.5GB；新增 4 条风险 |
| 01 | tech-feasibility.md | 新增 spike-011（Pass A 引擎选型）/ spike-012（资源压测）/ spike-013（hypothesis 替换稳定性）|
| 02 | design-brief.md §6.3.5 | 转录区从"录音结束后转录"占位 → 实时段落 + hypothesis/confirmed 视觉 + 10 分钟离线 banner |
| 02 | design-system.md §5.5.1（新增） | Multi Pass 段落稳定性视觉规范（hypothesis 灰斜体 → confirmed 正文 + 200ms accent 高亮过渡）|
| 02 | information-architecture.md §3.5 | 转录状态行扩展为 7 态（含 Pass A 跑中 / Pass A 关闭 / Pass B 排队 / Pass B 跑中 / Pass B 完成 / Pass B 失败 但 Pass A 保底）|
| 02 | user-flows.md §2 | 录音主路径加 Pass A / 中途增量 Pass B / Pass B 覆盖 分支 |
| 03 | overview.md §1 / §2 / §4.1 | 设计驱动力加 Multi Pass；进程拓扑改 ASR_LIVE / ASR_OFF；时序图重画 |
| 03 | transcription-pipeline.md §2 | EngineFacade 拆 StreamingEngine + OfflineEngine；新 §2.3 Orchestrator Multi Pass 状态机；§2.4 工厂改名 |
| 03 | data-model.md §1 / §2.1 / §4.1 | 录音目录加 transcript.live.json；meta 加 liveTranscribe 子状态 + transcribe.mode/timeRangesProcessed；TranscriptSegment 加 segmentId + stability；Transcript 加 pass / partial / timeRangesCovered |
| 03 | audio-capture.md §1.1 / §4.4（新增） | 设计目标加 PCM fork 条；新章节描述 PCM fork 到 Pass A utility 的 downmix + transferable 机制 |
| 03 | ipc-contract.md §3.1 / §3.2 / §3.3 | 命令加 transcribe:run-partial-offline / dismiss-partial-suggest / toggle-live / engine-test 改 which；事件加 transcribe:live-progress / live-segment / partial-offline-suggest / offline-overwrite；utility 协议拆 OfflineAsrTask + StreamingAsrTask |

**未做**（spike 后再补）：
- Pass A 引擎具体选型（streaming Zipformer 或 VAD 短窗 SenseVoice）——spike-011 拍板
- 默认下载模型清单——选 streaming Zipformer 则多加 ~150 MB
- 性能预算具体数字（Pass A CPU 占用、延迟实测）——spike-012 量化后回灌 PRD §7.1
- design 高保真稿（hypothesis/confirmed 视觉、banner、Pass B progress）——design-system 已定 token，等设计稿落地

---

## 显式未做（按约定推迟）

- **ADR 目录**：`adr/` 暂未起。`overview.md` §9 列出 10 条「已决待写 ADR」清单，至少前 3 条（macOS 14.2+ / sherpa-onnx / utility process）需在 M3 开始前补出来。
- **LLM 模板的具体 prompt**：属于 02-design 范围，仍在「待补」状态（`docs/02-design/README.md` 退出条件未打勾的那条）。架构层只定义了 [`Template` schema](./data-model.md) 与变量替换规则。
- **源码目录的最终确定**：[`overview.md`](./overview.md) §5.2 给了草案，正式 layout 在 04 阶段第一个 commit 之前再 finalize。
- **02-design 屏 0**：macOS 版本检查的独立屏需由 design 补，架构已记录在 audio-capture §7.1。

---

## 进入 04-development 前还需要做的事

### 必须（r5 新增 spike-011 / 012 / 013 → 拍板 Pass A 引擎前不能 freeze 架构）

1. **补 ADR 0001-0003**：macOS 14.2+ / sherpa-onnx N-API / utility process 三条已决策的 ADR
2. **跑 spike-005**：mic / system 漂移量化（spike-001 / 002 / 003 / 004 已通过）
3. **02-design 屏 0**（macOS 版本检查）+ LLM 模板 prompt v0.1
4. **跑 spike-011**：Pass A 引擎选型——streaming Zipformer vs VAD 短窗 SenseVoice 中文 CER + 延迟 + 内存对比；拍板后回写 transcription-pipeline §2.1 默认引擎、data-model.md / settings 默认 modelKey、PRD §7.1 性能预算
5. **跑 spike-012**：Pass A + 录音并发 1h 在 M1 / Intel Mac / Win i5 三档资源压测；不达标降级（Pass A 默认禁用 / 仅限高配机器）
6. **跑 spike-013**：hypothesis → confirmed 原地替换 UI 稳定性；segment id 跨周期不变率 > 90%

### 进 M3 之前

4. spike-010：快捷键 → 第一帧 PCM 拆分两阶段实测 < 100 ms / < 400 ms

### 进 M4 之前

5. spike-006：utility process 1h 录音 CPU / 内存 / RTF + sherpa-onnx-node Resampler 暴露与否
6. spike-007：模型镜像 fallback 在断网 / hf-mirror 慢 / github 快各组合下下载 OK
7. **CI 矩阵冻结**：macOS-arm64 / macOS-x64 / win-x64 三套，每 PR 跑"签名 + 公证 + 启动 smoke"

### 进 M5 之前

8. spike-008：云端转录端到端（OpenAI / DeepSeek 至少一家走通 verbose_json）
9. spike-009：长 transcript MapReduce 摘要，3 小时录音不超 token 限

---

## 下一阶段

进入 [`../04-development/`](../04-development/)，按 PRD §10 里程碑节奏：

- **M3**：骨架可跑（Electron + 主窗口 + 菜单栏 + 录音落盘，无转录）
- **M4**：本地转录跑通（sherpa-onnx 集成 + 模型下载）
- **M5**：LLM 摘要 + 录音库完整体验
- **M6**：v0.1 dogfood 版

架构层文档已不再阻塞编码——可以一边写代码一边在 04 里记踩坑笔记，必要时回写到本目录的相应文档作为 v0.2。
