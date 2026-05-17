# Screen Specs

> Mockup-ready 详细规格 — 每屏的控件、文案、状态、交互全部细化
> 是 [`../information-architecture.md`](../information-architecture.md)（页面清单）和 [`../design-system.md`](../design-system.md)（视觉规范）之间的桥梁
> 是 Pencil / Claude Design mockup 的直接输入

## 文档

- [`onboarding.md`](./onboarding.md) — 7 屏完整流程（欢迎 / 隐私 / 权限 / 4a 模型下载 / 4b API / 快捷键 / 合规 / 完成）
- [`settings.md`](./settings.md) — 7 个 tab（通用 / 录音 / 转录引擎 / LLM 模板 / 快捷键 / 隐私 / 关于）
- [`main-window-states.md`](./main-window-states.md) — 主窗口 3 个新状态变体（录音中 / 转录中 / 转录失败）+ 局部状态
- [`dialogs-notifications.md`](./dialogs-notifications.md) — 6 个对话框 + 5 类系统通知 + 3 类右键菜单 + 内嵌错误 + 文案库

## 使用方式

1. **Mockup 前**：找到对应屏幕的 spec，按"Mockup 必画"小节确认要画哪些状态
2. **Mockup 中**：按"区域"表格逐个搭，文案直接抄"文案库"
3. **Mockup 后**：根据"边界情况"小节补遗漏的状态
4. **review 时**：spec 是 ground truth，mockup 与 spec 不一致时改 mockup（除非 spec 错了，改 spec）

## 与其他文档的关系

```
PRD (01-research/prd.md)
   ↓ 拍板"要做什么"
information-architecture.md  ←→  user-flows.md  ←→  design-system.md
   骨架 / 页面清单                 流程 / 状态机        视觉 token / 组件
   ↓ 三者交叉                      
screen-specs/*.md  ←  本目录
   每屏的 mockup-ready 细节
   ↓
ui-mockups/ — 具体视觉稿（Pencil + Claude Design）
```
