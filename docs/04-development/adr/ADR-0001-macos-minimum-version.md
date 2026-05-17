# ADR-0001 macOS 最低版本 14.2+(CoreAudio Tap)

- **状态**:accepted
- **日期**:2026-05-17
- **驱动**:[`docs/01-research/tech-feasibility.md`](../../01-research/tech-feasibility.md) §R1 / [`docs/01-research/prd.md`](../../01-research/prd.md) §7.4
- **相关**:[`docs/03-architecture/audio-capture.md`](../../03-architecture/audio-capture.md) §平台路径 / [`docs/02-design/screen-specs/onboarding.md`](../../02-design/screen-specs/onboarding.md) 屏 0

## 背景

LazyAudio 在 macOS 上要同时录制系统音 + 麦克风。系统音采集路径在 macOS 上有三个分水岭(见 tech-feasibility §R1 表):

| macOS 版本  | 底层 API                                       | 权限提示                   |
| ----------- | ---------------------------------------------- | -------------------------- |
| **14.2+**   | CoreAudio Tap(`AudioHardwareCreateProcessTap`) | 仅麦克风                   |
| 13.0 – 14.1 | ScreenCaptureKit(`SCStream`)                   | 麦克风 + 屏幕录制          |
| < 13        | 无官方方案,需 BlackHole 等虚拟声卡             | 仅麦克风(但要装第三方驱动) |

Electron 35+ 在 14.2+ 上**自动**走 CoreAudio Tap;14.1 及以下回落 ScreenCaptureKit,即触发"屏幕录制"权限弹窗。

对一个**录音工具**来说,"屏幕录制"权限的解释成本是不可接受的体验税:用户会理直气壮地问"为什么录音要看我屏幕",信任成本远大于多覆盖一档 macOS 的收益。

## 决策(一句话)

**v0.1 最低支持 macOS 14.2+,只走 CoreAudio Tap 这一条干净路径;13.x / 14.0-14.1 用户在 onboarding 屏 0 看到「不兼容」提示并阻断启动。**

## 候选与否决理由

### 候选 A:仅 CoreAudio Tap(14.2+)— ✅ 选

- 权限清单只有一项「麦克风」,与用户对"录音工具"的心智一致
- API 稳定(Apple 官方,2023 年随 Sonoma 引入)
- 不需额外 native addon,Electron desktopCapturer 直接覆盖
- 已被 spike-001 验证(tech-feasibility R1 / 已 done)

**唯一代价**:13.x / 14.0-14.1 用户被排除。但据 Apple 2026 Q1 公开口径,macOS 14.2+ 渗透率已超过 80%(M 系列尤其高);v0.1 目标用户(P0 场景见 PRD §2.1)中估计影响 < 15%,且这部分用户可通过升级 macOS 解锁。

### 候选 B:仅 ScreenCaptureKit(12.3+)

- 覆盖更广(12.3 起的所有 mac)
- API 同样稳定,Apple 官方

**否决理由**:

- 必须申请 "屏幕录制" 权限,与产品定位严重错位 — 用户首次启动看到"LazyAudio 想要录制您的屏幕"是反感的源头
- ScreenCaptureKit 实际只取音频,不录视频,但权限框文案是 Apple 固定的,改不了
- Plan B(见 §Plan B)保留这条路径,但默认路径必须是 audio-only

### 候选 C:运行时分支(14.2+ 走 Tap、12.3-14.1 走 ScreenCaptureKit)

- 兼顾覆盖率 + 主流用户体验

**否决理由**:

- v0.1 阶段维护**两条音频采集代码路径**成本太高 — 不只是接口选择,SCStream 的事件模型与 CoreAudio Tap 完全不同,WAV 写入器、漂移补偿、设备切换处理都要双实现
- 用户文档 / onboarding 文案需要分版本讲,体验设计复杂度翻倍
- spike-001 / 002 的测试矩阵要覆盖两条路径,QA 成本翻倍
- v0.x 反馈如果显示 14.0-14.1 用户量足以让出 ROI,再扩;v0.1 先聚焦

## 后续影响

### 代码 / 主进程

- `src/main/system/permissions.ts`:启动早期检查 `os.release()` 解析出 macOS 版本号;< 14.2 → 阻断主窗口 + 引导到屏 0
- `src/main/system/audio-sources.ts`:只走 `desktopCapturer` + Electron 35+ 默认行为,不引入 SCStream 分支
- `src/main/windows/onboarding-window.ts`:屏 0(version-check)优先于其它 onboarding 步骤渲染

### 数据模型

- [`docs/03-architecture/data-model.md`](../../03-architecture/data-model.md) §3.1 `OnboardingStep` union 已经包含 `'version-check'`(屏 0 的 step id),与本 ADR 对齐

### 文档 / 用户路径

- ✅ PRD §7.4 已写"v0.1 不支持 14.0-14.1 / 13.x"
- ✅ tech-feasibility §R1 已写决策依据
- 🔲 02-design 屏 0(macOS 版本检查) — 文案 / 视觉补完(dev-plan §2.4 退出条件)
- 🔲 README "系统要求"节明确写 macOS 14.2+(留到 T71 写发布文档)
- 🔲 `build/Info.plist` 的 `LSMinimumSystemVersion` 必须设 `14.2`(留到 electron-builder.yml 配置,T01 后续 / 打包阶段)

### 测试 / CI

- T19 macOS smoke 测试矩阵只跑 14.2+ 镜像;不投入 13.x 测试资源
- spike-005(mic/system 漂移)和 spike-010(快捷键性能)都假设 14.2+,基线数据不向下兼容

### Plan B(若 CoreAudio Tap 在生产中暴露稳定性问题)

按 tech-feasibility §R1 Plan B,降级优先级:

1. force ScreenCaptureKit 路径(`--disable-features=MacCatapLoopbackAudioForScreenShare`)— 体验回退到候选 B,但代码无须重写
2. 自写 Swift native addon 直接调 CoreAudio Tap(参考 `makeusabrew/audiotee`),绕开 Electron 抽象
3. 极端情况引入 BlackHole 虚拟声卡作应急(不推荐,安装体验差)

Plan B 触发条件需要 spike-001 之外的真实分发数据;v0.1 不主动准备。

## v0.x 评估窗口

发布 30 天后看 PRD §9 监控数据,若**满足任一**:

- 收到 ≥ 3 个 13.x / 14.0-14.1 用户的明确升级阻力反馈
- 14.0-14.1 用户量 > 全用户量 10%(通过 about 页可选上报推算)

则重新开 ADR 评估"是否扩展到 ScreenCaptureKit 路径"(候选 C 复活)。
