# 02 — 产品 / UX 设计

需求拍板后，这里画产品该长什么样。

## 文档清单

骨架（page-level）：
- [`information-architecture.md`](./information-architecture.md) — 信息架构：页面 / 浮窗 / 菜单清单 + 层级关系
- [`user-flows.md`](./user-flows.md) — 5 个关键流程 + 状态机
- [`design-system.md`](./design-system.md) — 视觉规范：颜色 / 字体 / 间距 / 组件 / 动效 / 文案
- [`design-brief.md`](./design-brief.md) — 给 Claude Design 用的 AI-friendly brief（自包含浓缩版）

详细规格（control-level，mockup 直接输入）：
- [`screen-specs/`](./screen-specs/) — 每屏控件 / 文案 / 状态 / 边界 完整 spec
  - [`onboarding.md`](./screen-specs/onboarding.md) — 7 屏完整流程
  - [`settings.md`](./screen-specs/settings.md) — 7 个 tab
  - [`main-window-states.md`](./screen-specs/main-window-states.md) — 录音中 / 转录中 / 失败
  - [`dialogs-notifications.md`](./screen-specs/dialogs-notifications.md) — 对话框 / 通知 / 右键菜单 / 文案库

待补：
- _llm-templates.md_ — 5 个预置 LLM 模板的具体 prompt

`ui-mockups/` — 设计稿（两条线并行）：
- `local-pencil/` — 本地 Pencil .pen 设计稿（用 Pencil MCP 工具产出）
- `claude-design/` — Claude Design 产出（基于 design-brief.md + screen-specs/，由人去 Claude Design 跑）
- [`mockup-review.md`](./mockup-review.md) — **两套稿对比结论 + 实施基准**（开发前必读）

## 进入条件

`01-research/prd.md` 已定稿，TBD 全部拍板。 ✅

## 退出条件

- [x] IA / flows / system / brief 四份文档
- [x] Pencil 本地稿（P0 页面）
- [x] Claude Design 稿对比 → 结论见 [`mockup-review.md`](./mockup-review.md)
- [ ] LLM 模板 prompt 出 v0.1 版

完成上述 → 进入 `03-architecture/`。
