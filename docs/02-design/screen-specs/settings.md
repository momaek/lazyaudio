# Screen Specs — Settings

> v0.1 — 2026-05-16
> 7 个 tab 的完整控件规格
> 配套 [`../information-architecture.md#5-设置窗口`](../information-architecture.md)

---

## 设置窗口框架

### 窗口属性

| 项   | 值                                                     |
| ---- | ------------------------------------------------------ |
| 尺寸 | 960×680 默认 / 不可 resize（v0.2 可调）                |
| 形态 | 独立窗口                                               |
| 触发 | 菜单栏「设置…」/ 主窗口右上 ⚙ icon / `⌘,`              |
| 关闭 | `⌘W` 或 × 关闭，不弹确认（设置改了就改了，无暂存概念） |

### 布局

```
┌─ 标题栏 ─────────────────────────────────────────┐
├─ 左侧 nav (200) ──┬─ 右侧 content (760) ─────────┤
│ 通用             │                              │
│ 录音             │   {tab content}              │
│ 转录引擎  ◄──    │                              │
│ LLM 模板         │                              │
│ 快捷键           │                              │
│ 隐私             │                              │
│ 关于             │                              │
└──────────────────┴──────────────────────────────┘
```

### 左侧 nav

- 宽度 200px，bg `surface/canvas`（gray-50 / gray-950）
- 每项 height 32，padding [0, 16]，gap 1
- 项内：lucide icon 14 + label 13
- 选中：bg `surface/selected`（accent @ 8%）+ 左 3px accent border + accent 字色
- hover：bg `surface/hover`

| nav 项    | icon                 | label    |
| --------- | -------------------- | -------- |
| general   | `sliders-horizontal` | 通用     |
| recording | `mic`                | 录音     |
| engine    | `cpu`                | 转录引擎 |
| templates | `sparkles`           | LLM 模板 |
| shortcuts | `keyboard`           | 快捷键   |
| privacy   | `shield`             | 隐私     |
| about     | `info`               | 关于     |

### 右侧 content

- 宽度 760，bg `surface/panel`（white / gray-900）
- 顶部 header：tab 标题 24px bold + 副标题 12px gray
- 内容区：padding [24, 32]，scroll-y if overflow
- 设置项按 "section" 分组，每 section 有 section 标题（11px 700 uppercase letterSpacing 0.6 gray-500）

### 通用控件规范

| 控件                | 视觉                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Toggle**          | 36×20 圆角丸；开 accent / 关 gray-300；handle 16×16 白色，shadow-sm                                                        |
| **Select dropdown** | height 30，padding [0, 10]，border 1px gray-200，右侧 chevron-down，hover border gray-300                                  |
| **Text input**      | height 30，padding [0, 10]，border 1px gray-200，focus border accent + ring                                                |
| **Number input**    | 同 text，宽度 80                                                                                                           |
| **Path input**      | text input + 右侧 `[选择...]` button + 折叠显示路径（hover 显示完整）                                                      |
| **Setting row**     | horizontal padding [12, 0]，left label group / right control，alignItems center，min-height 48，bottom border 1px gray-100 |
| **Label group**     | vertical gap 2：label 13 medium + (可选) description 11 gray-500                                                           |
| **Danger button**   | red bg / red 边框 outline 二选一，依破坏性程度                                                                             |

---

## Tab 1 — 通用

### Header

- 标题 `通用`
- 副标题 `App 启动、外观、默认行为`

### Section 1：启动与窗口

| Setting          | Control | Default        | Behavior                                             |
| ---------------- | ------- | -------------- | ---------------------------------------------------- |
| 开机自启         | Toggle  | 关             | 启用后写入 LaunchAgents（macOS）/ Startup（Windows） |
| 关闭主窗口时     | Select  | 最小化到菜单栏 | 选项：`最小化到菜单栏` / `退出 App`                  |
| 启动时显示主窗口 | Toggle  | 关             | 关闭时仅菜单栏，需手动调出                           |
| 单击菜单栏图标   | Select  | 显示菜单       | 选项：`显示菜单` / `直接开始录音` / `显示主窗口`     |

### Section 2：外观

| Setting  | Control          | Default  | Behavior                         |
| -------- | ---------------- | -------- | -------------------------------- |
| 主题     | SegmentedControl | 跟随系统 | 三选一：`亮` / `暗` / `跟随系统` |
| App 语言 | Select           | 简体中文 | v0.1 仅简体中文，灰显但保留控件  |
| 列表密度 | SegmentedControl | 紧凑     | `紧凑 56px` / `宽松 72px`        |

### Section 3：默认会话类型

| Setting              | Control | Default  | Behavior                                                            |
| -------------------- | ------- | -------- | ------------------------------------------------------------------- |
| 录前默认会话类型     | Select  | 上次使用 | 选项：上次使用 / 通用 / 会议 / 笔记 / 面试官 / 面试者 / 课程 / 播客 |
| 快捷键跳过录音前浮窗 | Toggle  | 关       | 启用后 ⌘⇧R 用上次配置直接开录                                       |

### Mockup 必画

- 默认态（所有 toggle 关、默认值）

---

## Tab 2 — 录音

### Header

- 标题 `录音`
- 副标题 `录音文件、音频格式、自动行为`

### Section 1：保存位置

| Setting                 | Control         | Default                                               | Behavior                                             |
| ----------------------- | --------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| 保存目录                | Path input      | `~/Library/Application Support/LazyAudio/recordings/` | 改后立即迁移已有录音？**不迁移**，仅新录音使用新路径 |
| 在 Finder 显示          | text link       | —                                                     | 点击 = 打开 Finder 到上方路径                        |
| 自动清理超过 N 天的录音 | Number + Toggle | 关 / 90 天                                            | 启用时显示输入框，最小 7 天，最大 365                |

### Section 2：录音文件

| Setting                          | Control    | Default                       | Behavior                                                       |
| -------------------------------- | ---------- | ----------------------------- | -------------------------------------------------------------- |
| 生成分轨（mic.wav + system.wav） | Toggle     | 开                            | 关闭后仅生成 mixed.wav                                         |
| 生成混音（mixed.wav）            | Toggle     | 开                            | 不可与分轨同时关                                               |
| WAV 采样率                       | Select     | 16000 Hz                      | 选项：16000 / 24000 / 48000；提示 `16000 是转录最佳速率`       |
| 文件命名格式                     | Text input | `{sessionType}_{date}_{time}` | tokens 提示：`{sessionType}` / `{date}` / `{time}` / `{title}` |

### Section 3：录音中行为

| Setting                  | Control         | Default  | Behavior                                 |
| ------------------------ | --------------- | -------- | ---------------------------------------- |
| 录音结束自动转录         | Toggle          | 开       | 关闭后转录需手动触发                     |
| 录音中显示电平表         | Toggle          | 开       | 关闭后菜单栏只显示时长 + 红点            |
| 检测到长时间静音自动停止 | Toggle + Number | 关 / 60s | 启用时输入 30-600 秒；用于忘记停录的兜底 |
| 防误触：单次最短录音     | Number          | 2 秒     | < 2 秒的录音自动丢弃并提示               |

### Mockup 必画

- 默认态（**待画**）

---

## Tab 3 — 转录引擎

### Header

- 标题 `转录引擎`
- 副标题 `本地（sherpa-onnx）或云端（OpenAI 兼容 API）`

### 顶部模式切换

`SegmentedControl`（宽度 240，居中）：`本地（推荐）` / `云端`

- 切换时如另一方未配置，弹提示，不立即切换
- 当前激活态：accent bg + 白字
- 灰显态：gray-500 字 + 透明背景

### 模式 A — 本地

#### Section 1：当前引擎

- 大卡片显示当前默认模型：
  - 左：icon (lucide `cpu`) + 模型名 `SenseVoice-small (zh/en/ja/ko/yue, int8)` + 版本 `2025-09-09` + 状态 ✓ `已下载`
  - 右：`[切换默认]` / `[更新模型]`（仅有新版本时显示）

#### Section 2：已下载模型

列表，每行：

- icon `box` + 模型名 + 大小 + `[设为默认]`（非默认时显示）+ `[删除]` danger 链接

#### Section 3：可下载模型

列表，每行：

- icon `download-cloud` + 模型名 + 大小 + 简短描述 + `[下载]` button + 占用估算 `占 {x} MB`

模型清单（v0.1 内置 registry）：

1. SenseVoice-small int8 ✓（已默认） — 234 MB — 中英日韩粤通用
2. Whisper-base — 142 MB — 多语种兜底
3. Whisper-medium — 1.5 GB — 高精度多语种
4. FireRedAsr-AED — 1.1 GB — 中文专精
5. Silero VAD ✓（已默认依赖） — 2 MB

#### Section 4：高级（折叠）

| Setting            | Control | Default | Behavior                                                                  |
| ------------------ | ------- | ------- | ------------------------------------------------------------------------- |
| 线程数             | Number  | 2       | 1-8，M1 上 2 最优                                                         |
| Provider           | Select  | CPU     | `CPU` / `CoreML`（仅 macOS arm64）；CoreML 灰显 + 标注 `实验性，可能更慢` |
| 长录音切片并行     | Number  | 1       | 1-4，>30 min 录音收益明显                                                 |
| 转录段标点二次精修 | Toggle  | 关      | 启用后叠 CT-Transformer (+38 MB)                                          |

### 模式 B — 云端

#### Section 1：API 配置

表单同 [Onboarding 屏 4b](./onboarding.md#屏-4b--api-配置-云端分支)：

- Base URL
- API Key（password + 显示切换 + `[在 Keychain 中查看]` 链接）
- 转录模型 select / 自填
- Chat 模型（用于摘要）select / 自填

#### Section 2：连接

- `[测试连接]` button + 上次测试结果 `✓ 已连接 · 2026-05-16 14:30` / `✕ 失败 · 详情`
- `请求超时` Number 默认 60s
- `代理 URL` Text input 可选

#### Section 3：使用统计（仅云端）

- 本月调用次数 `123 次`
- 本月预估费用（如 API 支持 usage）`$2.45`
- `[清零统计]` 灰色链接

### Mockup 必画

- 本地模式（**待画**）
- 云端模式（**待画**）

---

## Tab 4 — LLM 模板

### Header

- 标题 `LLM 模板`
- 副标题 `按会话类型自动套用模板生成摘要，可改 prompt`
- 右上：`[恢复默认]` / `[导出全部]` / `[导入]`

### 左侧子 nav（在 content 区内）

宽度 200，5 个预置模板 + 1 个 "+ 新建" 按钮：

| icon             | name       |
| ---------------- | ---------- |
| `users`          | 会议纪要   |
| `pencil`         | 要点速记   |
| `user-search`    | 候选人评估 |
| `user-check`     | 自我复盘   |
| `graduation-cap` | 章节笔记   |
| `plus`           | + 新建模板 |

### 右侧编辑区

每个模板包含以下字段：

| Field          | Control                                | Default for 会议纪要 |
| -------------- | -------------------------------------- | -------------------- |
| 模板名         | Text input                             | `会议纪要`           |
| 应用于会话类型 | Multi-chip select                      | `meeting`            |
| 输出格式       | Select                                 | `Markdown`           |
| Prompt         | Textarea monospace（min-height 280px） | 见下                 |

**会议纪要 默认 prompt**（v0.1 初版，需打磨）：

```
你是一个专业的会议纪要助手。下面是一段会议的转录文本（mic = 我；system = 对方/会议内其他人）。

请生成一份结构化的会议纪要，包含：

## 议题
列出本次会议讨论的主要议题（3-7 条）。

## 决议
明确达成的决议（带责任人）。

## 待办
具体的 action items，格式：`- [ ] {内容} @{责任人} {期限}`。如果未明确，用 @未指定 / 期限未指定。

## 悬而未决
没有结论但需要后续跟进的议题。

## 摘要
用 2-3 句话总结本次会议核心。

要求：
- 用中文输出
- 不要编造转录里没有的内容
- 时间戳保留为 [HH:MM:SS] 格式
- 如果转录不清晰、不完整，明确指出
```

其他 4 个模板的默认 prompt 在 [`../llm-templates.md`](../llm-templates.md)（待补）。

### 编辑区底部

- `[预览 — 用最近一次录音的转录试跑]` secondary button
- `[保存]` primary（仅有改动时 enabled）
- `[重置为默认]` danger 链接

### Mockup 必画

- 默认态（会议纪要模板编辑中）（**待画**）

---

## Tab 5 — 快捷键

### Header

- 标题 `快捷键`
- 副标题 `全局快捷键 + App 内快捷键`
- 右上：`[全部重置]` 灰链接

### Section 1：全局快捷键

每行 setting row：

- 左：label + description
- 右：当前组合（chip 形式，每个修饰键 / 字母独立 chip）+ `[修改]` 链接

| 用途            | label             | description                           | 默认 (macOS) | 默认 (Windows) |
| --------------- | ----------------- | ------------------------------------- | ------------ | -------------- |
| 开始 / 停止录音 | `开始 / 停止录音` | `空闲时开始，录音中停止`              | `⌘ ⇧ R`      | `Ctrl ⇧ R`     |
| 暂停 / 继续     | `暂停 / 继续`     | `仅录音中可用`                        | `⌘ ⇧ P`      | `Ctrl ⇧ P`     |
| 显示主窗口      | `显示主窗口`      | `从菜单栏快速调出`                    | `⌘ 1`        | `Ctrl 1`       |
| 快速创建笔记    | `快速创建笔记`    | `直接开录 sessionType=note，跳过浮窗` | 未设         | 未设           |

### Section 2：App 内快捷键

只读列表，按区域分组（用户不能改）：

#### 录音浮窗

- `Enter` — 开始录音
- `Esc` / `⌘.` — 取消

#### 主窗口

- `⌘N` — 新录音（= 触发录音浮窗）
- `⌘F` — 搜索框 focus
- `⌘1..7` — 切换类型筛选 chip
- `Space` — 播放 / 暂停当前选中
- `↑ / ↓` — 列表项导航
- `Enter` — 重命名当前
- `Del` — 删除当前（弹确认）
- `⌘E` — 导出
- `⌘,` — 打开设置
- `⌘W` — 关闭窗口（最小化到菜单栏 / 退出，依设置）

#### 转录文本

- `⌘C` — 复制选中段
- `⌘A` — 全选

### Section 3：修改快捷键的交互

点击 `[修改]`：

- chip 变为录入态 `按下新的组合键…` blinking
- 监听 keydown，必须含至少一个修饰键
- 录入成功：显示新 chip + `✓` + `[确认]` / `[取消]`
- 冲突：
  - 与本 App 其他动作冲突 → 红框 `与「{用途}」冲突`，不允许保存
  - 与系统级常用快捷键冲突 → 黄框 `系统级快捷键，可能被覆盖`，允许保存
- Esc 取消修改

### Mockup 必画

- 默认态（**待画**）
- 修改中状态（**待画**）

---

## Tab 6 — 隐私

### Header

- 标题 `隐私`
- 副标题 `数据存储位置、错误上报、清理工具`

### Section 1：数据

| Setting      | Control   | Default                              | Behavior                                      |
| ------------ | --------- | ------------------------------------ | --------------------------------------------- |
| 录音数据位置 | 只读 path | macOS / Windows 默认路径             | 链接 `在 Finder 显示`                         |
| API key 存储 | 只读 info | `系统 Keychain / Credential Manager` | 不可改                                        |
| 录音合规提示 | Toggle    | 开                                   | 关闭后录音前不再提示（onboarding 已过的不算） |

### Section 2：错误与崩溃上报（v0.1 全部关闭，预留）

| Setting          | Control           | Default | Behavior                     |
| ---------------- | ----------------- | ------- | ---------------------------- |
| 崩溃报告         | Toggle (disabled) | 关      | 灰显 + `v0.1 暂未开启此功能` |
| 使用统计（匿名） | Toggle (disabled) | 关      | 同上                         |

### Section 3：清理工具（danger zone）

页面底部，红色边框 frame：

| 操作                 | Button         | Behavior                                              |
| -------------------- | -------------- | ----------------------------------------------------- |
| 清空所有录音         | danger outline | 弹双重确认 dialog；删除整个 recordings 目录           |
| 清空所有模型         | danger outline | 删除 models 目录；下次启动需重下                      |
| 重置 App（不删录音） | danger outline | 删除 settings.json，下次启动走 onboarding             |
| 完全卸载（删一切）   | danger         | 删 recordings + models + settings；提示需手动卸载 App |

### Mockup 必画

- 默认态（**待画**）

---

## Tab 7 — 关于

### Header

- 标题 `关于`
- 副标题 `版本、协议、致谢`

### Section 1：版本

居中 block：

- App icon 64×64
- 标题 `LazyAudio` 22px bold
- 版本 `v0.1.0 · 2026-05-16` 12px gray
- 一行链接：`[官网]` `[GitHub]` `[反馈]`

### Section 2：检查更新

- `[检查更新]` button + 状态 `已是最新` / `发现新版本 v0.1.1 [查看更新]`
- 上次检查时间

### Section 3：协议

折叠面板：

- LazyAudio：MIT
- sherpa-onnx：Apache-2.0
- SenseVoice：MIT
- Silero VAD：MIT
- onnxruntime：MIT
- Electron：MIT
- lucide icons：ISC
- 完整 license 文本 `[查看全部]` 链接

### Section 4：致谢

一段文字列举：sherpa-onnx 团队、FunAudioLLM、Silero、Anthropic（Claude Code）、ScreenCaptureKit / CoreAudio Tap docs 作者等。

### Mockup 必画

- 默认态（**待画**）

---

## 跨 tab 一致性约束

| 项                   | 规则                                           |
| -------------------- | ---------------------------------------------- |
| Section 间距         | gap 32                                         |
| Setting row 间距     | bottom-border 1px gray-100 分隔，min-height 48 |
| Label / control 对齐 | label 左对齐，control 右对齐                   |
| Toggle 行为          | 立即生效，无 "保存" 按钮                       |
| Input 行为           | blur / Enter 后生效；Esc 还原                  |
| Danger 操作          | 必弹确认 dialog，红色 primary                  |
| 滚动                 | 仅 content 区滚动，nav 固定                    |
| 快捷键 ⌘W            | 关闭设置窗口                                   |
