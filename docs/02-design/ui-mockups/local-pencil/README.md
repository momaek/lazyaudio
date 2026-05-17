# LazyAudio — Pencil 本地稿（完整版）

> v0.1 全量 P0 / P1 屏幕 — 25 个屏幕全部出图
> 配套 [`../../screen-specs/`](../../screen-specs/) 详细规格
> 与 `../claude-design/` 并行，两条线交叉验证

## 文件位置

```
docs/02-design/ui-mockups/local-pencil/lazyaudio.pen
```

**已保存** ✅（2026-05-16，~336 KB，25 屏 + 组件）。

后续让我修改时，我会直接对这个路径操作（Pencil MCP 的 `filePath` 参数），不再用 `/new` —— 避免 active editor 切换造成误覆盖风险。

## 全部屏幕节点（25 个）

### 主窗口（5 个状态变体）

| 屏幕 | 节点 ID | 尺寸 | spec 参考 |
|---|---|---|---|
| 主窗口 — 有数据 | `F7IAj` | 1280×800 | IA §3 |
| 主窗口 — 空状态 | `tJ8X9` | 1280×800 | screen-specs/main-window-states.md |
| 主窗口 — 录音中 | `9NNLZ` | 1280×800 | main-window-states.md §状态 3 |
| 主窗口 — 转录中 | `x654X` | 1280×800 | main-window-states.md §状态 4 |
| 主窗口 — 转录失败 | `RR9ca` | 1280×800 | main-window-states.md §状态 5 |

### Onboarding（7 屏完整流程）

| 屏幕 | 节点 ID | 尺寸 | spec 参考 |
|---|---|---|---|
| 1. 欢迎 | `bDV6O` | 880×640 | onboarding.md §屏 1 |
| 2. 隐私模式 | `ykeQn` | 880×640 | onboarding.md §屏 2 |
| 3. 权限引导 | `RaY8X` | 880×640 | onboarding.md §屏 3 |
| 4a. 模型下载 | `4w0SN` | 880×640 | onboarding.md §屏 4a |
| 4b. API 配置 | `8WIOY` | 880×640 | onboarding.md §屏 4b |
| 5. 快捷键 | `HsnXG` | 880×640 | onboarding.md §屏 5 |
| 6. 合规提示 | `B5toZ` | 880×640 | onboarding.md §屏 6 |
| 7. 完成 | `0cnY7` | 880×640 | onboarding.md §屏 7 |

### 设置窗口（7 个 tab）

| Tab | 节点 ID | 尺寸 | spec 参考 |
|---|---|---|---|
| 通用 | `nub4y` | 960×680 | settings.md §Tab 1 |
| 录音 | `3XJRF` | 960×680 | settings.md §Tab 2 |
| 转录引擎 — 本地 | `rpMbb` | 960×680 | settings.md §Tab 3 模式 A |
| 转录引擎 — 云端 | `tk7m7` | 960×680 | settings.md §Tab 3 模式 B |
| LLM 模板 | `ARyC3` | 960×680 | settings.md §Tab 4 |
| 快捷键 | `juK8h` | 960×680 | settings.md §Tab 5 |
| 关于 | `HR01V` | 960×680 | settings.md §Tab 7 |

> 隐私 tab（Tab 6）暂未出图 — 与"通用"/"录音"结构相同，按 spec 即可补。

### 浮窗 / 菜单（3 个）

| 屏幕 | 节点 ID | 尺寸 | spec 参考 |
|---|---|---|---|
| 录音前确认浮窗 | `2R2Ve` | 360×240 | IA §4 |
| 菜单栏 dropdown — 空闲 | `UK55d` | 300×340 | IA §2 |
| 菜单栏 dropdown — 录音中 | `oC6tH` | 300×380 | IA §2 |
| 列表项右键菜单 | `NufON` | 240×280 | dialogs-notifications.md §3.2 |

### 对话框（2 个核心）

| 屏幕 | 节点 ID | 尺寸 | spec 参考 |
|---|---|---|---|
| 删除确认 | `cPk9p` | 440×220 | dialogs-notifications.md §D1 |
| 录音中退出 | `WXTiK` | 440×220 | dialogs-notifications.md §D2 |

> 其他 4 个对话框（D3 Onboarding 关闭 / D4 双重确认 / D5 麦克风缺失 / D6 磁盘不足）共用 D1/D2 的视觉模板，仅文案不同，未单独出图。

### 系统通知（2 个）

| 屏幕 | 节点 ID | 尺寸 | spec 参考 |
|---|---|---|---|
| 转录完成 | `Ga6Vc` | 360×88 | dialogs-notifications.md §N1 |
| 转录失败 | `FDrk8` | 360×88 | dialogs-notifications.md §N2 |

## 画布布局（屏幕在 .pen 中的位置）

```
y = 0       主窗口（有数据 / 空状态）— x: 0 / 1360
y = 880     录音浮窗 + 菜单栏 2 态 + Onboarding 2 — x: 0 / 440 / 820 / 1200
y = 1600    Onboarding 1 / 3 / 4a / 4b — x: 0 / 920 / 1840 / 2760
y = 2280    Onboarding 5 / 6 / 7 — x: 0 / 920 / 1840
y = 3000    设置：通用 / 录音 / Engine Local — x: 0 / 1000 / 2000
y = 3720    设置：Engine Cloud / LLM 模板 / 快捷键 — x: 0 / 1000 / 2000
y = 4440    设置：关于 — x: 0
y = 5220    主窗口录音中 / 转录中 / 失败 — x: 0 / 1360 / 2720
y = 6120    Dialog 删除 / 退出 + 右键菜单 + 2 通知 — x: 0 / 520 / 1040 / 1340
```

## 与 screen-specs 的对应

每个屏幕都对照 [`../../screen-specs/`](../../screen-specs/) 中的 spec 画：

- ✅ 所有 P0 状态全部覆盖
- ✅ P1 屏幕（设置 7 tab、Onboarding 3-7、主窗口失败 / 转录中）全部覆盖
- ⚠️ 未单独出图（共用模板，spec 写明）：设置隐私 tab、其他 4 个对话框

## 重要规范：Chrome-less 窗口

所有 5 个主窗口屏幕（有数据 / 空 / 录音中 / 转录中 / 失败）**已重构为 chrome-less**：
- 删掉了 old-school 的 44px 标题栏 chrome 行
- Traffic light（macOS 三圆点）嵌入 sidebar 顶部 36px 高的 row 中
- 设置 ⚙ 图标在同一 row 右侧
- App 名 "LazyAudio" 完全不显示（dock / menu bar 已有）
- 9NNLZ 录音中状态：红色 banner 只跨内容区（x=280 开始），不跨 sidebar，保持 traffic light 区域干净

规范见 [`../../design-system.md#101-chrome-less-窗口规范重要`](../../design-system.md) 和 [`../../design-brief.md#41-chrome-less-窗口重要约束`](../../design-brief.md)。

设置窗口的 7 个 tab 仍是 chrome 风格（左 nav + 右 content），下一轮如需统一可再改。

## 已知小问题（不影响整体）

- **字体 `Menlo` / `SF Mono` 不被 Pencil 识别** → 转录文本、时间戳、快捷键 chip 的 monospace 视觉效果暂时退化为默认字体（结构正确）。导出代码时在 design system 里定义实际字体即可。
- **少量 lucide icon 名不匹配**（`pause-circle`、`download-cloud`、`check-circle-2`、`alert-circle`、`more-horizontal`）→ Pencil 显示为空白或替代图标。后续调整可换为 `pause`+border、`download`、`check`、`alert-triangle`、`ellipsis` 等存在的图标。
- **小屏 deep border 偶尔渲染弱** → Pencil 的 stroke direction 在某些 frame 上不完美。

这些都是 .pen 内部表达问题，不是设计问题；导出到真实 React/Electron 实现时自然解决。

## 视觉一致性 checklist（review 时对照）

每屏都遵守：
- ✓ Surface 层级：canvas (gray-50) / panel (white) / raised + shadow / sunken (gray-100)
- ✓ Accent #1F6FEB（按钮、链接、选中、当前段）
- ✓ Record #E5484D（仅录制态）
- ✓ Danger #DC2626（错误、删除）
- ✓ 会话类型色（紫 / 蓝 / 黄 / 绿 / 橙 / 粉 / 灰）只用在徽章 + 列表项色点
- ✓ 圆角阶梯：徽章 4 / 输入按钮 6 / 列表项 8 / 浮窗 12
- ✓ 间距阶梯：4 / 8 / 12 / 16 / 24 / 32
- ✓ 字号阶梯：11 (meta) / 12 (control) / 13 (body) / 15 (item title) / 18 (panel title) / 22-28 (page title)

## 下一步

1. **保存 .pen 到本地路径**（Pencil 内 Save As）
2. **你那边把 [design-brief.md](../../design-brief.md) + [screen-specs/](../../screen-specs/) 丢给 Claude Design 跑** → 产出放 `../claude-design/`
3. **两条线对比** → 决定哪边的视觉决策更过关，统一到一份
4. 补 [llm-templates.md](../../llm-templates.md)（5 个预置 LLM prompt v0.1 版）
5. 完成上述后 → 进入 `03-architecture/`
