# CLAUDE.md

> 这份文件 Claude Code 每次 session 都会加载。保持精简，**只指路 + 给硬约束**，详细内容指向 `docs/`。

## 项目

**LazyAudio** — 本地实时录音转录工具。系统音频 + 麦克风双轨录制，本地 sherpa-onnx 转录，可选 LLM 摘要。Electron + Vite + React + TypeScript。

- 目标平台：macOS arm64 / x64（主），Windows x64（次）。Linux 不支持。
- 目标节奏：~13 周内出 v0.1 到 GitHub Releases。
- **当前里程碑**：Pre-M3（spike + 脚手架）。

## 每次 session 必做

按顺序：

1. 读 [`docs/04-development/progress.md`](./docs/04-development/progress.md) §1「当前焦点」 + §0 SOP
2. 在 [`docs/04-development/development-plan.md`](./docs/04-development/development-plan.md) 找到目标 T / spike / ADR 的 AC
3. 按 progress.md §0.3 end-of-work loop 收尾（更新状态、开 PR、用 `.github/pull_request_template.md`）

## 写 UI / 改 UI 前必做

任何涉及窗口、组件、样式、布局、交互、文案、图标的任务（包括「写个 React 组件」「调 CSS」「加按钮」「改浮窗」），**动手写代码前**必须按这个顺序读：

1. `ls docs/02-design/ui-mockups/claude-design/project/` 找到对应屏幕的 jsx 原型（如 `prerecord.jsx` / `main-window.jsx` / `onboarding.jsx` / `settings.jsx` / `menubar.jsx` / `waveform.jsx`），读完再写
2. 读 [`docs/02-design/screen-specs/`](./docs/02-design/screen-specs/) 里对应那份（`main-window-states.md` / `onboarding.md` / `settings.md` / `dialogs-notifications.md`）拿状态机和交互细节
3. 读 [`docs/02-design/design-system.md`](./docs/02-design/design-system.md) 拿颜色 / 间距 / 字号 / radius / 动效 token；[`tokens.css`](./docs/02-design/ui-mockups/claude-design/project/tokens.css) 是 token 的源
4. **不照搬 jsx 的 className 字面值**，但视觉与交互必须一致。"偏离"分两种，**别混**：
   - **视觉 / 交互偏离**（用户看得见的差别：尺寸、色、字、间距、按钮位置、状态机、文案）→ **先告诉用户为啥，等同意再动**
   - **实现策略**（同样视觉、不同代码结构：窗口尺寸、popover 滚动 vs 溢出、token vs 字面值、DOM 嵌套、CSS 选择器组织）→ **直接做**，PR body 里说一句即可，**不算偏离 mockup**
5. Pencil 稿（`local-pencil/`）已被 [`mockup-review.md`](./docs/02-design/mockup-review.md) 降级为参考，**不作为实施依据**，不要看

如果 jsx 原型与 screen-specs 冲突：以 screen-specs 为准，并在 PR 里指出冲突让用户裁决。

## 改 UI bug 前必做：先质疑结构

修 UI bug 前，先问一遍：**这个 bug 是不是当前实现结构衍生出来的？**

**结构问题的典型信号**（出现 ≥1 个就停下来）：

- 需要**绕过 / 屏蔽 / 补偿**某个已有决策（典型：靠 `hasShadow: false` 抑制窗口本不该有的阴影）
- 当前修法在打**前一个修法**的补丁（补丁深度 ≥ 2）
- 修一个表象会引出下一个表象，像挤气球（修阴影 → 透出别窗 → 横向滚动 → ...）

**步骤**：

1. 找 bug 的**根**，不是表象。如果根是某个**实现决策**（不是 mockup 约束），把它显式写出来
2. 给用户提两个方案：**A 改结构** / **B 在现有结构里打补丁**
3. 默认推 A，除非 A 牵涉多文件 / 多模块
4. 让用户选

**反例**（T11 prep 浮窗这一轮）：用户反馈"对话框下方有幽灵阴影"。

- ❌ 在「保留 360×420 透明 + 200px popover 缓冲区」前提下加 `hasShadow: false` → 衍生出"showcase 透出 / 横向 scrollbar / 阴影偏下"一连串补丁
- ✅ 直接质疑"为啥窗口比对话框高 200px" → 砍缓冲区、窗口缩 220、popover 改 `max-height + overflow-y: auto` 内部滚动，一刀清

## 第一次进项目的 bootstrap

如果当前 session 没有上下文、用户还没指派任务：

1. `cat docs/04-development/progress.md` 看「当前焦点」+ 速查面板
2. `cat docs/04-development/development-plan.md` §1（总体节奏）+ §2-§7 找到当前里程碑那节
3. **不要凭空选任务**。把候选清单（progress.md §1）汇报给用户，问做哪个；除非用户明说"接着上次"。
4. 如果 progress.md「当前焦点」有 🔄 任务，那就是上次没收尾的，先确认是否继续。

## 文档导航

| 我想                                      | 看哪里                                                                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 知道项目要做什么                          | [`docs/01-research/prd.md`](./docs/01-research/prd.md)                                                                              |
| 看 UI / 交互                              | [`docs/02-design/`](./docs/02-design/)                                                                                              |
| 看技术架构                                | [`docs/03-architecture/`](./docs/03-architecture/)（overview / audio-capture / transcription-pipeline / data-model / ipc-contract） |
| 看仓库结构                                | [`docs/04-development/project-structure.md`](./docs/04-development/project-structure.md)                                            |
| 看 TypeScript / 命名 / IPC / 错误处理规约 | [`docs/04-development/coding-conventions.md`](./docs/04-development/coding-conventions.md)                                          |
| 看 build / 签名 / 发版                    | [`docs/04-development/build-and-release.md`](./docs/04-development/build-and-release.md)                                            |
| 看任务定义 + AC + 退出条件                | [`docs/04-development/development-plan.md`](./docs/04-development/development-plan.md)                                              |
| 看任务**当前状态**                        | [`docs/04-development/progress.md`](./docs/04-development/progress.md)                                                              |

## 硬约束

- **文档默认中文**。代码注释 / commit msg / PR / Issue 也中文。
- **Git**：不主动 `commit` / `push` / `merge`。用户明说才动。不准 `--no-verify` / `--amend` / `force push`。
- **progress.md 与代码同 PR**：状态变更必须和触发它的代码改动在同一个 PR 里。
- **AC 没全过不准 ✅**。详见 progress.md §0.2 DoD。
- **不复制 AC**：progress.md 的 §1 checkbox 是工作区（PR 合并后清空），不是 AC 的副本。AC 单一信息源在 development-plan.md。
- **UI 实施基准（强制）**：动手写任何 UI 代码前，**必须**先按上面「写 UI / 改 UI 前必做」那节读完 jsx 原型 + screen-specs + design-system。没读就写 = 返工。jsx 原型在 [`docs/02-design/ui-mockups/claude-design/project/`](./docs/02-design/ui-mockups/claude-design/project/)，是**视觉与交互**的唯一基准；视觉 / 交互偏离前先报备，**改实现结构（同视觉、换代码）不算偏离，直接做**。修 UI bug 走「改 UI bug 前必做」那节，**先质疑结构再补丁**。
- **改 spec 前先报备**：要改 dev-plan / PRD / 03-architecture / 02-design 任何文档，先告诉用户为啥要改，等同意再动。
- **包管理用 pnpm**，不要 npm 或 yarn。
- **不要主动写 README / \*.md** 文档，除非用户要求。
- **不要塞 emoji 到代码 / 文档**（progress.md 的状态 emoji 是约定例外）。

## 工作流速查

| 场景                 | 看哪节                                                            |
| -------------------- | ----------------------------------------------------------------- |
| 选下一个任务         | progress.md §1 候选                                               |
| 任务怎么算完成       | progress.md §0.2 DoD                                              |
| **写 / 改 UI**       | **本文「写 UI / 改 UI 前必做」节，必须读完 jsx + spec + tokens**  |
| **修 UI bug**        | **本文「改 UI bug 前必做：先质疑结构」节，别先打补丁**            |
| 写完代码怎么收尾     | progress.md §0.3 end-of-work loop                                 |
| 遇到 blocker         | progress.md §0.4 + §5 登记                                        |
| 时间不够要砍 scope   | development-plan.md §10.2                                         |
| 周报模板             | development-plan.md §12，写进 progress.md §6                      |
| Spike 跑出"此路不通" | tech-feasibility.md 写结论 → 该 spike 仍标 ✅ → 触发砍 scope 流程 |

## 项目运行时事实

- 包管理：**pnpm**
- Node：见 `.nvmrc`（T01 后落地）
- 模型默认目录：`~/Library/Application Support/LazyAudio/models/`（mac）
- 日志：`~/Library/Logs/LazyAudio/main.log`（mac）/ `%APPDATA%/LazyAudio/logs/`（win）
- 录音默认目录：`~/Documents/LazyAudio/recordings/`
- 三个进程角色：main（主）/ renderer（UI + 录音采集）/ utility（ASR worker）
- IPC channel 命名：`<domain>:<action>`，schema 在 `shared/ipc/`

## 当前阶段提醒

Pre-M3 阶段：T01 之前仓库还没脚手架，跑 `pnpm dev` / 写 src/ 都没意义。当前应该聚焦的是：

- 5 个未完 spike（005 / 010 / 011 / 012 / 013）
- ADR-0001 / 0002 / 0003
- T01-T06 脚手架 issue

按 progress.md §1 的候选顺序推进。
