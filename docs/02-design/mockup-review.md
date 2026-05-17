# UI Mockup Review — Claude Design vs Pencil

> 两套设计稿的对比结论。开发实施时按本文的「实施基准」执行，避免误用偏离 brief 的版本。
>
> Review 日期：2026-05-16
> 对照 brief：[`design-brief.md`](./design-brief.md) + [`screen-specs/`](./screen-specs/)
> 两套稿位置：[`ui-mockups/claude-design/`](./ui-mockups/claude-design/) + [`ui-mockups/local-pencil/`](./ui-mockups/local-pencil/)

---

## 实施基准（开发请直接看这里）

**以 `ui-mockups/claude-design/` 为视觉与交互实施基准。**

理由：
1. Token 化严格——`tokens.css` 完整覆盖 brief §5.1 / §5.1.1 / §5.1.2 / §5.2 / §5.4.1，包含深色 override
2. 状态覆盖更全——31 个 artboard，含全部主窗口 5 态、深色、Windows、App Icon、设置全 tab + 二次确认 modal
3. 信息密度达 brief §3 调性要求（Linear / Obsidian 量级）
4. 已经是 JSX + CSS，落地 React/Electron 时可直接对照结构

**`ui-mockups/local-pencil/` 仅作视觉对照 / 评审用，不作为开发参考。** 几处偏离 brief 的地方见下。

---

## Pencil 版需要注意的偏离（不要照搬）

### 🔴 严重 — 必须按 Claude Design

| 屏 | Pencil 节点 | 问题 |
|---|---|---|
| **主窗口 · 录音中** | `9NNLZ` | 画错了：只有两条音量条 + 一个大按钮区，没有 brief §6.3.5 要求的实时滚动波形、转录骨架屏、摘要 disabled 占位。**开发请完全无视这屏，按 Claude Design `mw-mac-light-recording` 实现** |
| **Onboarding 屏 1 · App icon** | `bDV6O` | 直接用了麦克风图标。与 brief §6 P8 App Icon 明确写的"避免话筒+音符这种烂大街组合"冲突，并且把整个 visual identity 锁死成"录音 App"。**App icon 按 Claude Design 的「文档卡片 + 右下音波小球」概念**（见 `claude-design/project/app-icon.jsx`） |

### 🟡 偏移 — 按 brief 走（Claude Design 也按 brief 实现了）

| 项 | Pencil | brief / Claude Design |
|---|---|---|
| 主窗口空状态 | 无 chip 行 / 无键帽视觉 / 无引导贴士 | 保留 chip 行 + `⌘ ⇧ R` 键帽 + 3 条灰字贴士 |
| 菜单栏「最近录音」 | 平铺 3 条 | 子菜单 `▸` + "在主窗口中查看全部…" |
| 设置 · 转录引擎 · 模型状态 | "下载"按钮 | 三态徽章：`✓ 已下载` / `↓ 未下载` / `下载中…进度` |
| 字体 | monospace 退化（README 自述 `SF Mono` 不识别）| 严格 `var(--font-mono)` |

### 🟢 缺图（不算错，但开发需补）

Pencil 没出图、按 Claude Design 实现即可：
- 深色模式（Claude 有 4 屏）
- Windows 版主窗口（Claude 有 1 屏）
- App Icon master + 缩略（Claude 有 mac + win 2 套）
- 设置 → 隐私 tab + 二次确认 modal

---

## Claude Design 也需要注意的几点

Claude Design 整体过关，但落地时几处判断要复核：

1. **列表项色点 6px vs brief 写的 4px**——chat1 记录里设计师说"4px 在 retina 上视觉消失"主动改成 6px。开发时确认按 6px 实现（视觉先于规范）
2. **设置窗口左侧 nav icon**——临时用了 unicode 符号（⚙ ⏺ ⏯ ✦ ⌘ ◉ ⓘ），落地时要换成正经 line icons（lucide 或自绘）
3. **错误堆栈展示**——失败态详情区显示完整 stack trace + retry/backoff 日志，信息密度高，但需要确认是产品想要的（vs. 仅显示一句"网络超时 [重试]"）

---

## 评审 / 验收用稿

如果需要给非技术 stakeholder 评审，**用 Pencil 出的图**做演示更直观（图片比 HTML 渲染快、不依赖本地 server）。但用前注意上面那两屏严重偏离的，避免被当成"已定稿"。

---

## 相关文档

- [`design-brief.md`](./design-brief.md) — brief 本体（自包含浓缩版）
- [`design-system.md`](./design-system.md) — 完整视觉规范
- [`screen-specs/`](./screen-specs/) — 控件级 spec
- [`ui-mockups/claude-design/project/`](./ui-mockups/claude-design/project/) — Claude Design HTML 稿（实施基准）
- [`ui-mockups/local-pencil/lazyaudio.pen`](./ui-mockups/local-pencil/lazyaudio.pen) — Pencil .pen（视觉对照）
