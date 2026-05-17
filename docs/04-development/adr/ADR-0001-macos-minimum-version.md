# ADR-0001 macOS 最低版本 14.2+

- **状态**:proposed(占位,T01 落地;完整理由 / 候选对比待补)
- **日期**:2026-05-17
- **相关**:[`../../01-research/prd.md`](../../01-research/prd.md) §7.4 / [`../../03-architecture/audio-capture.md`](../../03-architecture/audio-capture.md)

## 背景

LazyAudio 要在 macOS 上同时录制系统音 + 麦克风。系统音采集路径有两条:

1. **CoreAudio Tap**(macOS 14.2+):audio-only,只要麦克风权限
2. **ScreenCaptureKit**(macOS 12.3+):需要"屏幕录制"权限

对一个"录音工具"来说,要"屏幕录制"权限对用户解释成本高、心智门槛大。

## 决策(一句话)

**v0.1 仅支持 macOS 14.2+,走 CoreAudio Tap;不向下兼容 13.x / 14.0–14.1。**

## 候选与否决理由

待补 — 见 [`../../01-research/tech-feasibility.md`](../../01-research/tech-feasibility.md) spike-001 数据(macOS 双轨录音可行性已验证)。需要扩充:

- 候选 A:仅 CoreAudio Tap(14.2+)
- 候选 B:仅 ScreenCaptureKit(12.3+)
- 候选 C:运行时分支(14.2+ 用 Tap、12.3–14.1 用 ScreenCaptureKit)

## 后续影响

- onboarding 屏 0 加 macOS 版本检查(02-design 待补 + T50 实现)
- 13.x / 14.0–14.1 用户 → 阻断启动 + 给"不兼容"提示
- 文档:PRD §7.4 已声明;`build-and-release.md` 的 Info.plist `LSMinimumSystemVersion` 需对齐 `14.2`
