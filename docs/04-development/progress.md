# 开发进度（live）

> **最后更新**：2026-05-24
> **当前里程碑**：Pre-M3 → M3 过渡（spike-012 另 session 在跑;T10 本 session 起步）
> **当前焦点**：T10 主进程脚手架 ✅ 待 PR;下一候选 T11 录音前浮窗 / T12 音频采集（依赖 T10）
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
| ✅ done                   | 20                                              |
| 🔄 wip                    | 1（spike-012 另 session）                       |
| ⛔ blocked                | 0                                               |
| 🔲 todo                   | 39                                              |
| 本周燃尽                  | —                                               |

---

## 1. 当前焦点（Active）

> 同时不超过 2-3 项。空着也行，表示在选下一个任务。

### T10 — 主进程脚手架 ✅ 待 PR

起始 2026-05-24 · 完成 2026-05-24 · 分支 `feat/T10-main-scaffold`

来源：[`development-plan.md` T10](./development-plan.md) M3 第一个 code task。

**AC checkbox**（dev-plan T10 原 AC 只一句"点 tray 能弹 dropdown，⌘⇧R 能弹 prep 浮窗"，下面拆细）：

- [x] **AC1** lifecycle 拆 `lifecycle/single-instance.ts` + `lifecycle/before-quit.ts`（before-quit 给 T17 状态保护留 hook 点，T10 不实现录音退出阻断）
- [x] **AC2** 三个窗口工厂落到 `windows/`：main-window（拆出）/ prep-window（**常驻 hidden** 520×360 frameless）/ settings-window（按需 880×640）
- [x] **AC3** `menu/tray.ts`：Tray 实例 + 空闲态 5 项 dropdown；T10 阶段 icon 用 `nativeImage.createEmpty()` + `setTitle('LA')` 占位（proper template icon 留 T70）
- [x] **AC4** `menu/app-menu.ts`：macOS app menu 标准骨架（About / Hide / Quit + Edit / View / Window / Help；Win/Linux setApplicationMenu(null) 清默认）
- [x] **AC5** `shortcut/register.ts` + `shortcut/handler.ts`：`CommandOrControl+Shift+R` 注册；handler 当前永远 show prep（T12 接录音状态机时按 user-flows §2.2 双向语义改，TODO 已留）；app will-quit 时 `unregister`
- [x] **AC6** `src/main/index.ts` 收成 slim orchestrator（env → single-instance → logger → before-quit handler → app.whenReady → ipc + app-menu + main-window + prep-window + tray + shortcut）
- [x] **AC7** 手测（用户截图 3 张交叉验证）：menubar "LA" ✅ + dropdown 5 项 ✅ + ⌘⇧R 弹 prep 浮窗（frameless 520×360）✅ + 设置窗口 ✅（bonus）；before-quit log 触发 → ⌘Q 退出 ✅；3 个窗口期间 app 一直活着（隐含关主窗口不退）
- [x] **AC8** `pnpm lint`（0 errors，3 pre-existing i18next warnings 与本 PR 无关）+ `pnpm typecheck`（pass）+ `pnpm test`（4/4 pass）；§4.2 T10 ✅ + 速查面板 wip 2 → 1 / done 19 → 20 / todo 40 → 39

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

| ID   | 标题                   | 状态    | 分支 / PR              | 起         | 完         | 备注                                                 |
| ---- | ---------------------- | ------- | ---------------------- | ---------- | ---------- | ---------------------------------------------------- |
| T10  | 主进程脚手架           | ✅ done | feat/T10-main-scaffold | 2026-05-24 | 2026-05-24 | lifecycle+windows×3+menu/tray+shortcut;手测 3 截图过 |
| T11  | 录音前浮窗（prep）     | 🔲 todo | —                      | —          | —          | 依赖 T10                                             |
| T12  | 音频采集（renderer）   | 🔲 todo | —                      | —          | —          | 依赖 T10                                             |
| T13  | WAV 流式落盘（main）   | 🔲 todo | —                      | —          | —          | 依赖 T12                                             |
| T14  | mixdown                | 🔲 todo | —                      | —          | —          | 依赖 T13                                             |
| T15  | 录音库 v0.1            | 🔲 todo | —                      | —          | —          | 依赖 T10                                             |
| T15a | 崩溃恢复扫描           | 🔲 todo | —                      | —          | —          | 依赖 T13                                             |
| T16  | 详情区 - 播放器        | 🔲 todo | —                      | —          | —          | 依赖 T15                                             |
| T17  | 状态保护               | 🔲 todo | —                      | —          | —          | 依赖 T13                                             |
| T18  | 设置窗口骨架           | 🔲 todo | —                      | —          | —          | 依赖 T10                                             |
| T19  | CI 加 macOS smoke 测试 | 🔲 todo | —                      | —          | —          | 依赖 T13                                             |
| T20  | 权限引导（简版）       | 🔲 todo | —                      | —          | —          | 依赖 T10                                             |

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
