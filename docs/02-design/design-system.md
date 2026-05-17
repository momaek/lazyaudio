# LazyAudio Design System

> 版本 v0.1 — 2026-05-16
> 配套 [`information-architecture.md`](./information-architecture.md) + [`user-flows.md`](./user-flows.md)
> 本文档定义视觉语言、组件规范、文案模板。v0.1 范围内必须 lock 的视觉决策。

---

## 1. 设计调性

### 1.1 关键词

- **沉稳**：本地优先 → 像系统工具，不像消费 SaaS
- **专注**：不抢戏，录音 / 转录 / 摘要才是主角
- **快**：视觉上无多余动效，但状态变化有明确反馈
- **可信任**：处理的是用户的会议 / 面试 / 私密音频，UI 要让人放心

### 1.2 不做的事

- ❌ 渐变背景 / 玻璃拟态 / 大量阴影
- ❌ 卡通插画 / 装饰性 emoji
- ❌ 营销感按钮（"立即升级" / "马上体验"）
- ❌ 过度动画（除了必要的录制脉冲、加载旋转）

### 1.3 参考调性

- macOS 系统设置、Logic Pro 录音面板
- Linear（克制 + 信息密度高）
- Tana / Obsidian 的工具感

---

## 2. 颜色

### 2.1 中性色阶（gray）

```
gray-50    #FAFAFA
gray-100   #F4F4F5
gray-200   #E4E4E7
gray-300   #D4D4D8
gray-400   #A1A1AA
gray-500   #71717A
gray-600   #52525B
gray-700   #3F3F46
gray-800   #27272A
gray-900   #18181B
gray-950   #09090B
```

### 2.2 品牌色 + 状态色

| 用途 | token | 浅色模式 | 深色模式 |
|---|---|---|---|
| 主色（accent）| `accent` | `#1F6FEB`（信任蓝）| `#4493F8` |
| 录制红 | `record` | `#E5484D` | `#FF6369` |
| 成功 | `success` | `#3E9B4F` | `#46A758` |
| 警告 | `warning` | `#D97706` | `#F2A742` |
| 失败 | `danger` | `#DC2626` | `#FF6369`（同录制红家族）|
| 转录中（pending）| `pending` | `#6B7280` | `#9CA3AF` |

### 2.3 会话类型色板（type colors）

每种类型一个固定 hue，明度自适应（浅色模式取 500，深色模式取 400）。

| sessionType | 浅色 | 深色 | 用途 |
|---|---|---|---|
| `general` | gray-500 | gray-400 | 兜底 |
| `meeting` | `#3B82F6`（blue-500） | `#60A5FA` | 协作感 |
| `note` | `#EAB308`（yellow-500） | `#FACC15` | 速记感 |
| `interview-as-interviewer` | `#A855F7`（purple-500）| `#C084FC` | 主动 |
| `interview-as-candidate` | `#EC4899`（pink-500）| `#F472B6` | 被评估 |
| `lecture` | `#10B981`（emerald-500）| `#34D399` | 学习 |
| `podcast` | `#F97316`（orange-500）| `#FB923C` | 内容创作 |

> 颜色仅作徽章 + 列表项边缘 / icon，不大面积铺，避免花俏。

### 2.4 背景层级（浅色 / 深色）

| 层级 | 浅色 | 深色 | 用途 |
|---|---|---|---|
| L0 chrome | gray-50 | gray-950 | 标题栏 / 菜单栏 |
| L1 surface | white | gray-900 | 主内容区背景 |
| L2 raised | gray-100 | gray-800 | 浮窗 / 卡片 |
| L3 hover | gray-200 | gray-700 | 列表项 hover |
| 边框 | gray-200 | gray-800 | — |

---

## 3. 字体

### 3.1 字体栈

```css
/* UI */
font-family:
  -apple-system, BlinkMacSystemFont, "SF Pro Text",
  "Segoe UI", "PingFang SC", "Microsoft YaHei",
  system-ui, sans-serif;

/* 转录文本 + 时间戳 + meta */
font-family:
  "SF Mono", "Cascadia Mono", "JetBrains Mono",
  Menlo, Consolas, monospace;
```

### 3.2 字号 / 行高 / 字重

| token | 字号 / 行高 | 字重 | 用途 |
|---|---|---|---|
| `text-xs` | 11 / 16 | 400 | 时间戳、辅助说明 |
| `text-sm` | 13 / 20 | 400 | 列表项副信息 / meta |
| `text-base` | 14 / 22 | 400 | 主体文本（默认）|
| `text-lg` | 16 / 24 | 500 | 列表项标题 |
| `text-xl` | 18 / 26 | 600 | 详情头标题 |
| `text-2xl` | 22 / 30 | 600 | onboarding 标题 |

转录文本：13/22 monospace 浅色，时间戳 11/16 monospace 灰色。

---

## 4. 间距 / 圆角 / 阴影

### 4.1 间距 token

```
s-0   0
s-1   4
s-2   8
s-3   12
s-4   16
s-5   20
s-6   24
s-8   32
s-10  40
s-12  48
```

### 4.2 圆角

```
radius-sm   4    /* 徽章、tag */
radius-md   6    /* 输入框、按钮 */
radius-lg   8    /* 卡片、列表项 */
radius-xl   12   /* 浮窗 */
radius-full 999  /* 圆点、avatar */
```

### 4.3 阴影（克制）

```
shadow-sm   0 1px 2px rgba(0,0,0,0.04)    /* 列表项 hover */
shadow-md   0 4px 12px rgba(0,0,0,0.08)   /* 浮窗 */
shadow-lg   0 12px 32px rgba(0,0,0,0.12)  /* modal */
```

深色模式阴影换为更深的描边色（`gray-800`）+ 轻微 box-shadow。

---

## 5. 核心组件规范

### 5.1 类型徽章 (`<TypeBadge>`)

视觉：圆角矩形 4px + icon（12px）+ label（11px）+ 类型色。

```
┌──────────────┐
│ 🗂 会议       │   高度 20px，padding 0 6px
└──────────────┘
```

- 背景：类型色 @ 10% 透明度
- 文字：类型色（深色模式取浅色变体保证对比）
- icon：lucide / Heroicons 风格的 outline 图标

可在不同密度下切换：
- **紧凑**：仅 icon + 颜色点（用于列表项）
- **标准**：icon + label（用于详情头）

### 5.2 呼吸红点 (`<RecordingDot>`)

录音中的核心视觉锚点。

```css
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--record);
  animation: breathe 1.2s ease-in-out infinite;
}
@keyframes breathe {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.92); }
}
```

- 暂停状态：动画 `paused`，颜色降为 gray-400
- 列表项中尺寸 = 8px，菜单栏中 = 10px

### 5.3 转录状态徽章 (`<TranscriptStatus>`)

| 状态 | 文字 | 颜色 token | icon |
|---|---|---|---|
| recording | 录制中 | record | 呼吸红点 |
| pending | 排队中 | pending | `⋯` |
| running | 转录中 34% | pending | 旋转圆环 |
| done | （不显示徽章，显示类型徽章）| — | — |
| failed | 转录失败 | danger | `⚠` |

### 5.4 时间戳锚点 (`<Timestamp>`)

```
[01:23:45]
```

- monospace, 11px, gray-500
- hover: 下划线 + accent 色
- 当前播放段：accent 色 + 加粗
- 点击：音频跳转

### 5.5 Speaker 标识 (`<SpeakerTag>`)

不用 emoji（emoji 在不同 OS 视觉不一）。统一用单字 + 圆点。

```
●M  ●S
```

| speaker | 圆点颜色 | 标签 | label |
|---|---|---|---|
| mic | accent | M | 我 |
| system | orange-500 | S | 对方 |

转录段落布局：

```
[00:14]  ●M  你好我们今天讨论一下项目进度
[00:18]  ●S  好的，先看一下上周的 milestone…
[00:32]  ●M  …
```

视觉区分：speaker 圆点 4px + 一个字母（10px monospace）+ 8px 间距 + 文字。

### 5.5.1 Multi Pass 段落稳定性视觉（v0.1 P0）

PRD F4.6：录音中 Pass A 输出的段落带 `stability: 'hypothesis' | 'confirmed'` 状态；几秒后 hypothesis 段被 confirmed 替换。

| stability | 视觉 |
|---|---|
| `hypothesis` | 段落文字 `font-style: italic` + `color: gray-400/gray-500`（弱化）；speaker 圆点保持原色但 opacity 70% |
| `confirmed` | 段落文字 `font-style: normal` + `color: text-base`（正文色）；speaker 圆点 opacity 100% |
| `confirmed` 替换 hypothesis 瞬间 | 200ms `background-color` 从 accent @ 6% 过渡回 transparent（提示"这段刚被刷新"，不刺眼） |
| Pass B 完成、整体覆盖 Pass A 后 | 全部 segments 进入 confirmed 视觉；详情头右侧加 `✓ 离线精修` 12px 灰字标记（提示"这是最终版"） |

**禁止**：
- ❌ hypothesis 段加进度旋转 icon / "正在识别…" 文字 → 干扰阅读
- ❌ confirmed 替换时整段闪烁 / 高亮 > 300ms → 视觉抖动
- ❌ Pass B 覆盖时弹 toast / 切视图 → 用户已经在读，打断节奏

### 5.6 列表项 (`<RecordingListItem>`)

紧凑密度（默认）：

```
┌─────────────────────────────────────────┐
│ 🗂  面试官 2026-05-16 14:30  · 01:12:34  │  ← 一行：徽章 + 标题 + 时长
│     "好的我们先从你的项目说起…"          │  ← 二行：转录预览（截断 60 字符）
└─────────────────────────────────────────┘
```

- 高度 56px（紧凑） / 72px（宽松，含两行）
- 选中态：左侧 3px accent 色边 + L3 hover 背景
- 录音中：徽章替换为呼吸红点，标题加 "(录制中)"

### 5.7 按钮

| 类型 | 用法 | 视觉 |
|---|---|---|
| Primary | "开始录音" / "确认" | accent 色填充，白字 |
| Secondary | "取消" | 透明背景 + accent 色边 + accent 色字 |
| Ghost | 列表内联操作 | 仅 hover 时显示背景 |
| Destructive | "删除" 确认按钮 | danger 色填充 |
| Icon-only | 工具栏 icon | 16px icon + 8px padding |

按钮高度：32px（默认） / 28px（紧凑） / 40px（onboarding）。

### 5.8 输入框

- 高度 32px
- 边框：1px gray-200 / gray-800
- focus：边框 accent + 2px 浅色光环
- 错误态：边框 danger + 文字 danger

### 5.9 浮窗 (`<Floating>`)

录音前确认浮窗：

- 宽度：360px
- 圆角：12px
- 背景：L2 raised
- 阴影：shadow-md
- 入场：100ms ease-out，scale 0.96 → 1，opacity 0 → 1

---

## 6. 图标系统

### 6.1 图标库

[Lucide](https://lucide.dev/) — outline 风格，跨平台一致，体积小。

### 6.2 关键图标映射

| 用途 | lucide 名 |
|---|---|
| 录音 | `mic` |
| 系统音 | `monitor-speaker` 或 `volume-2` |
| 播放 | `play` |
| 暂停 | `pause` |
| 停止 | `square` |
| 搜索 | `search` |
| 设置 | `settings` |
| 删除 | `trash-2` |
| 导出 | `download` |
| 复制 | `copy` |
| 重试 | `refresh-cw` |
| 在 Finder 显示 | `folder-open` |
| 提示 | `info` |
| 错误 | `alert-circle` |
| 警告 | `alert-triangle` |
| 成功 | `check-circle` |

### 6.3 会话类型 icon

不复用 lucide 单一图标，每种类型定 1 个：

| sessionType | 候选 lucide |
|---|---|
| general | `circle` |
| meeting | `users` |
| note | `pencil` |
| interview-as-interviewer | `user-search` |
| interview-as-candidate | `user-check` |
| lecture | `graduation-cap` |
| podcast | `mic-2` |

---

## 7. 文案规范

### 7.1 总原则

- 中文 UI 用半角标点（避免占用过多视觉宽度）
- 错误说人话："网络连接超时" 而非 "ETIMEDOUT 110"
- 操作按钮用动词："开始录音" / "重新生成"，而非 "确定" / "OK"
- 不强加情绪："转录失败" 而非 "哎呀出错了"

### 7.2 关键文案

| 场景 | 文案 |
|---|---|
| 主窗口空状态 | "还没有录音 — 按 ⌘⇧R 开始第一次录音" |
| 录音浮窗主按钮 | "开始录音 →" |
| 录音停止后列表项状态 | "排队中…" → "转录中 34%" → "已完成" |
| 删除确认 | "确认删除「{标题}」？录音文件、转录、摘要会一并删除，不可恢复。" |
| 退出录音中确认 | "录音将停止并保存，确定退出 LazyAudio？" |
| 模型下载失败 | "下载失败 — {原因}。可切换镜像源或重试。" |
| 麦克风被拒 | "LazyAudio 没有麦克风权限。打开「系统设置 → 隐私 → 麦克风」授权。" |
| API key 错误 | "API key 无效或已过期，请到「设置 → 转录引擎」重新配置。" |
| 转录失败通用 | "转录失败：{简述}。[重试] [复制错误]" |

### 7.3 时间格式

- 列表项时间：`HH:mm`（今天 / 昨天分组内）/ `MM-DD HH:mm`（更早分组）
- 详情头时间：`YYYY-MM-DD HH:mm:ss`
- 时长：`MM:SS`（< 1h） / `HH:MM:SS`（≥ 1h）

---

## 8. 动效

### 8.1 时长 / 缓动

| 用途 | 时长 | easing |
|---|---|---|
| 列表项 hover | 80 ms | ease-out |
| 浮窗 / Modal 入场 | 100 ms | ease-out |
| 浮窗 / Modal 退场 | 80 ms | ease-in |
| 录音中呼吸红点 | 1200 ms | ease-in-out, infinite |
| 转录 loading 旋转 | 800 ms | linear, infinite |
| 数字滚动（时长 / 进度）| 200 ms | ease-out |

### 8.2 不做的动效

- 列表项进入 stagger 动画
- 页面切换 slide
- 鼠标 follow 光标特效

---

## 9. 深色模式

- 跟随系统（默认） / 强制浅色 / 强制深色（设置中可选）
- 切换瞬间：背景 + 文字过渡 150ms，无闪烁
- 录音红点在深色模式提亮（`#FF6369`），保证可见

---

## 10. 平台差异

| 项 | macOS | Windows |
|---|---|---|
| **窗口 chrome** | **无独立标题栏行**，traffic light 嵌入 sidebar 顶部（见 §10.1） | 自绘极简 chrome：minimize/maximize/close 嵌入 sidebar 顶部右侧 |
| 字体 | SF Pro / PingFang SC | Segoe UI / Microsoft YaHei |
| 菜单栏 | 顶部 menu bar（系统级，App 不放任何 chrome） | 系统托盘 (tray) |
| 滚动条 | overlay，可隐藏 | 永久占位（Windows 11 可换 overlay）|
| 快捷键修饰符 | ⌘ / ⌥ / ⌃ / ⇧ | Ctrl / Alt / Shift |
| 通知 | macOS 通知中心 | Windows Toast |
| 窗口拖拽区 | 整个 sidebar 顶部 36px 行（`-webkit-app-region: drag`） | 同左 |

### 10.1 Chrome-less 窗口规范（重要）

LazyAudio 主窗口 / 设置窗口 **不画独立的标题栏 chrome 行**（不重复显示 App 名）。理由：

- 现代 macOS app（Linear / Arc / Notion / Cursor / Tana / Raycast）都已抛弃"顶部 chrome + App 名"的 old-school 模式
- App 名在 dock / app switcher / menu bar 里都已显示，窗口内重复显示是浪费像素
- 回收 44px 给主内容区，信息密度更高

**规范布局**：

```
┌────────────────────────────────────────────────┐
│ ● ● ●                            ⚙ │ ← Sidebar 顶部 36px，traffic light + 设置入口
├──────────────┬─────────────────────────────────┤
│  [搜索]      │  内容区起始，无 chrome 缓冲       │
│  ...         │  ...                             │
└──────────────┴─────────────────────────────────┘
```

- Sidebar 顶部第一个 row：高 36，padding `[0, 12]`，horizontal layout，justifyContent `space_between`，alignItems center
  - 左：traffic light 三圆点（直径 12，gap 8）
  - 右：设置 ⚙ icon（lucide `settings`，15px，gray-400）
- Sidebar 整体 bg 用 `surface/canvas`（gray-50），traffic light 行**与 sidebar 同底色**，不画分隔线
- 内容区从窗口 y=0 开始（无 chrome 行偏移），padding 顶部 20-24 给主标题留呼吸

**特例**：录音中横条（红色 banner，见 [`screen-specs/main-window-states.md`](./screen-specs/main-window-states.md)）只跨**内容区**（x=sidebar 宽 / 280），不跨 sidebar — 这样 traffic light 行始终保持灰底干净状态。

**禁止**：
- ❌ 画一整行 chrome（标题栏 / App 名 / window controls in own bar）
- ❌ 内容区顶部贴一个 "标题 / 副标题" 当 chrome 用
- ❌ traffic light 浮在 content 上（必须在 sidebar 内）

---

## 11. 锁定的视觉决策（PRD §12 的回答）

| PRD 问题 | design-system 答案 |
|---|---|
| 默认全局快捷键 | macOS `⌘⇧R` / Windows `Ctrl+Shift+R` |
| 类型徽章视觉 | §5.1 — icon + label + 类型色 @ 10% bg |
| 呼吸红点 | §5.2 — 8px / 10px，1.2s 周期 60%↔100% |
| 录音库列表项密度 | §5.6 — 默认紧凑 56px，可在设置切宽松 72px |
| 主窗口尺寸 | 默认 1280×800，最小 960×600，记住上次尺寸 |
| speaker mic/system 视觉 | §5.5 — accent / orange 圆点 + M / S 字母 |
| 错误状态文案 | §7.2 — 模板化 |

剩余的"LLM 模板 prompt" 和 "App Icon 草图" 在另外两个文档里收口（[`llm-templates.md`](./llm-templates.md) — TBD，App Icon 在 ui-mockups/ 里出方案）。

---

## 12. 与 mockup 的接口

mockup 应直接引用本文档的 token，**不再随意取色取间距**。任何 mockup 里新出的视觉元素，必须先在 design-system 里登记。
