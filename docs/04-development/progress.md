# 开发进度（live）

> **最后更新**：2026-05-17
> **当前里程碑**：Pre-M3
> **当前焦点**：尚未开工，下一步推荐 → `spike-011`（Pass A 引擎选型，2d，最高优先级）
> **配套**：[`development-plan.md`](./development-plan.md)（任务定义 + AC + 依赖）

---

## 0. 协作 SOP（Claude Code 必读）

开 session 前后按这个流程走，状态就不会丢：

1. **开工前**：读本文件 §1「当前焦点」+ 在 `development-plan.md` 找到对应 T / spike 的 AC。
2. **动手**：把目标任务状态从 🔲 改成 🔄，填「起始日期」，必要时挪到 §1 展开子步骤。
3. **完工**：AC 逐条复核 → 全过才改 ✅，填「完成日期」+ 链 PR/commit。
4. **遇到 blocker**：状态改 ⛔，**必须**在 §5 写一句话说明卡在哪、需要什么解开。
5. **每次改动**：顶部「最后更新」改成今天；若焦点切换，同步「当前焦点」一行。
6. **不要做的事**：
   - 不要复制 `development-plan.md` 的 AC 到这里（保持单一信息源）。
   - 不要把超过 1 周没动的 🔄 留着 — 要么变 ⛔ 写原因，要么回 🔲。
   - 同时 🔄 任务尽量 ≤ 2 个，避免上下文切换。

---

## 状态图例

| 标记 | 含义 |
|---|---|
| 🔲 todo | 没开始 |
| 🔄 wip | 进行中 |
| ⛔ blocked | 卡住（必须写卡在 §5）|
| ✅ done | AC 全过 |

---

## 速查面板

| 维度 | 数字 |
|---|---|
| 总任务（T + spike + ADR） | 4 + 9 + 4 = 17（pre-M3）/ 44 (M3-M7 T) = **61** |
| ✅ done | 4（spike-001/002/003/004）|
| 🔄 wip | 0 |
| ⛔ blocked | 0 |
| 🔲 todo | 57 |
| 本周燃尽 | — |

---

## 1. 当前焦点（Active）

> 同时不超过 2-3 项。空着也行，表示在选下一个任务。

_目前没有 WIP 任务。_

**下一步候选**（按 dev-plan §2.4 退出条件倒推）：

- `spike-011` Pass A 引擎选型（2d，**最阻塞**，影响 ADR-0004 + M4 模型清单）
- `spike-010` 快捷键 → 第一帧 PCM 性能基线（0.5d，影响 PRD §7.1）
- `T01` 仓库脚手架（可与 spike 并行起步）

---

## 2. Pre-M3 — Spike

| ID | 标题 | 状态 | 起 | 完 | 备注 / PR |
|---|---|---|---|---|---|
| spike-001 | macOS 双轨录音 | ✅ done | — | 已完 | tech-feasibility |
| spike-002 | Windows 双轨录音 | ✅ done | — | 已完 | tech-feasibility |
| spike-003 | sherpa-onnx + Electron POC | ✅ done | — | 已完 | tech-feasibility |
| spike-004 | macOS 签名 + 公证链 | ✅ done | — | 已完 | tech-feasibility |
| spike-005 | mic / system 漂移量化 | 🔲 todo | — | — | 0.5d |
| spike-010 | 快捷键 → 第一帧 PCM < 100/400 ms | 🔲 todo | — | — | 0.5d |
| spike-011 | Pass A 引擎选型 | 🔲 todo | — | — | **2d；阻塞 ADR-0004 + M4** |
| spike-012 | Pass A + 录音并发 1h 资源压测 | 🔲 todo | — | — | 1d；依赖 011 |
| spike-013 | hypothesis → confirmed 替换 UI 稳定性 | 🔲 todo | — | — | 0.5d |

---

## 3. Pre-M3 — ADR

| ID | 主题 | 状态 | 完 | 备注 |
|---|---|---|---|---|
| ADR-0001 | macOS 最低版本 14.2+（CoreAudio Tap vs ScreenCaptureKit）| 🔲 todo | — | M3 首 commit 前必出 |
| ADR-0002 | sherpa-onnx + macOS @loader_path 加载链 | 🔲 todo | — | M3 首 commit 前必出 |
| ADR-0003 | ASR 跑 utility process | 🔲 todo | — | M3 首 commit 前必出 |
| ADR-0004 | Pass A 引擎选型 | 🔲 todo | — | spike-011 完成后写 |

---

## 4. 任务清单

### 4.1 Pre-M3 — 脚手架（T01-T06）

| ID | 标题 | 状态 | 分支 / PR | 起 | 完 | 备注 |
|---|---|---|---|---|---|---|
| T01 | 仓库脚手架 | 🔲 todo | — | — | — | 第一个 PR |
| T02 | CI: lint + typecheck + test | 🔲 todo | — | — | — | 依赖 T01 |
| T03 | Tailwind + design tokens（浅 + 深双模式）| 🔲 todo | — | — | — | 依赖 T01 |
| T04 | IPC 框架 | 🔲 todo | — | — | — | 依赖 T01 |
| T05 | i18n 框架 | 🔲 todo | — | — | — | 依赖 T01 |
| T06 | 日志框架 | 🔲 todo | — | — | — | 依赖 T01 |

**Pre-M3 退出条件**（dev-plan §2.4 复核）：

- [ ] spike-005 / 010 / 011 / 012 / 013 全部拍板
- [ ] ADR-0001 / 0002 / 0003 写完
- [ ] T01-T06 全部 done，CI 绿
- [ ] 02-design 屏 0（macOS 版本检查）补完
- [ ] LLM 模板 prompt v0.1 至少 meeting / note 两个

### 4.2 M3 — 骨架可跑（T10-T20）

| ID | 标题 | 状态 | 分支 / PR | 起 | 完 | 备注 |
|---|---|---|---|---|---|---|
| T10 | 主进程脚手架 | 🔲 todo | — | — | — | — |
| T11 | 录音前浮窗（prep）| 🔲 todo | — | — | — | 依赖 T10 |
| T12 | 音频采集（renderer）| 🔲 todo | — | — | — | 依赖 T10 |
| T13 | WAV 流式落盘（main）| 🔲 todo | — | — | — | 依赖 T12 |
| T14 | mixdown | 🔲 todo | — | — | — | 依赖 T13 |
| T15 | 录音库 v0.1 | 🔲 todo | — | — | — | 依赖 T10 |
| T15a | 崩溃恢复扫描 | 🔲 todo | — | — | — | 依赖 T13 |
| T16 | 详情区 - 播放器 | 🔲 todo | — | — | — | 依赖 T15 |
| T17 | 状态保护 | 🔲 todo | — | — | — | 依赖 T13 |
| T18 | 设置窗口骨架 | 🔲 todo | — | — | — | 依赖 T10 |
| T19 | CI 加 macOS smoke 测试 | 🔲 todo | — | — | — | 依赖 T13 |
| T20 | 权限引导（简版）| 🔲 todo | — | — | — | 依赖 T10 |

**M3 退出条件**：录音→停止→库→播放全程无报错；macOS + Windows 各自跑通；30min 长录音；CI smoke 过；PRD §7.1 性能 #1/#2/#5 测过。

### 4.3 M4 — 本地转录跑通（T30-T40）

| ID | 标题 | 状态 | 分支 / PR | 起 | 完 | 备注 |
|---|---|---|---|---|---|---|
| T30 | sherpa-onnx 加载链 | 🔲 todo | — | — | — | 依赖 ADR-0002 |
| T31 | 模型下载（Pass B SenseVoice int8）| 🔲 todo | — | — | — | 依赖 T30 |
| T32 | Pass B Offline Engine | 🔲 todo | — | — | — | 依赖 T31 |
| T33 | 转录文本展示 | 🔲 todo | — | — | — | 依赖 T32 |
| T34 | Pass A Streaming Engine | 🔲 todo | — | — | — | 依赖 ADR-0004 + T32 |
| T35 | hypothesis → confirmed 视觉 | 🔲 todo | — | — | — | 依赖 T34 |
| T36 | Pass A → Pass B 切换 | 🔲 todo | — | — | — | 依赖 T34 |
| T37 | 转录失败处理 | 🔲 todo | — | — | — | 依赖 T32 |
| T38 | 设置 - 转录引擎 tab | 🔲 todo | — | — | — | 依赖 T31 |
| T39 | 全文搜索 | 🔲 todo | — | — | — | 依赖 T32 |
| T40 | 长录音中途离线提醒（PRD F4.8）| 🔲 todo | — | — | — | 依赖 T36 |

**M4 退出条件**：30min → Pass B 自动出 → UI 显示；实时字幕 hypothesis 几秒变 confirmed；1h Pass A→B 切换；全文搜索；CI transcription smoke；RTF ≤ 0.1；2.5 GB 内存上限验证。

### 4.4 M5 — 库 + LLM 摘要 + onboarding（T50-T58）

| ID | 标题 | 状态 | 分支 / PR | 起 | 完 | 备注 |
|---|---|---|---|---|---|---|
| T50 | Onboarding 完整流程（8 屏）| 🔲 todo | — | — | — | 屏 4a 复用 T31 |
| T51 | LLM 摘要核心 | 🔲 todo | — | — | — | 5 个内置模板 |
| T52 | 设置 - LLM 模板 tab | 🔲 todo | — | — | — | 依赖 T51 |
| T53 | 云端转录 | 🔲 todo | — | — | — | 依赖 T33 |
| T54 | 导出（md/txt/srt）| 🔲 todo | — | — | — | 依赖 T33 |
| T55 | 列表项操作完整 | 🔲 todo | — | — | — | 依赖 T16 |
| T56 | 系统通知 | 🔲 todo | — | — | — | 依赖 T32 |
| T57 | 设置完整 | 🔲 todo | — | — | — | 依赖 T52 |
| T58 | 深色模式 toggle + 过渡 | 🔲 todo | — | — | — | 依赖 T18 |

**M5 退出条件**：首启 → onboarding → 录音 → 转录 → 摘要全自动；LLM 模板自动套用；至少一家云端走通；e2e CI 过。

### 4.5 M6 — Dogfood（T60-T64）

| ID | 标题 | 状态 | 起 | 完 | 备注 |
|---|---|---|---|---|---|
| T60 | 自己每天用一周 | 🔲 todo | — | — | 记 friction，不修 P0 外 |
| T61 | 性能优化 | 🔲 todo | — | — | 按 dogfood 反馈 |
| T62 | bug 收尾 | 🔲 todo | — | — | 关所有 P0/P1 |
| T63 | 文案 review | 🔲 todo | — | — | design-system §7.2 |
| T64 | release pre-flight | 🔲 todo | — | — | 三平台干净机器 |

**M6 退出条件**：7 天 dogfood 0 崩溃；P0/P1 全关；三平台 packaged OK；changelog v0.1.0 写完。

### 4.6 M7 — v0.1 发布（T70-T74）

| ID | 标题 | 状态 | 起 | 完 | 备注 |
|---|---|---|---|---|---|
| T70 | release artifacts | 🔲 todo | — | — | tag v0.1.0 |
| T71 | README + 安装文档 | 🔲 todo | — | — | 截图 + Gatekeeper 说明 |
| T72 | electron-updater 集成 | 🔲 todo | — | — | 旧版本平滑升级 |
| T73 | 小范围分发 | 🔲 todo | — | — | 5-10 个朋友 |
| T74 | 监控 | 🔲 todo | — | — | 24h 看反馈 |

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

| 日期 | 变更 |
|---|---|
| 2026-05-17 | 初稿；从 development-plan.md 抽取所有 spike / ADR / T01-T74 |
