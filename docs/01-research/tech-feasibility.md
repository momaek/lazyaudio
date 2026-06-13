# 技术可行性验证

> 目标：在写第一行代码之前，把"如果这个走不通，整个产品形态要重做"的关键技术风险识别 + 验证 + 退路想清楚。

## 风险登记表（Risk Register）

| ID  | 风险                                      | 严重性   | 当前判断                                                                                                                                     | 建议                                    |
| --- | ----------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| R1  | macOS 同时录系统音 + 麦克风（audio-only） | **致命** | ✅ Electron 39+ 默认走 CoreAudio Tap（macOS 14.2+），仅需麦克风权限（35 回退 SCKit 误索屏幕权限，见 §Electron 版本要求 + ADR-0001 实测订正） | **低风险**，已 spike 确认               |
| R2  | Windows 同时录系统音 + 麦克风             | **致命** | ⚠️ 能录但有已知 bug                                                                                                                          | 需 spike 验证当前 Electron 版本         |
| R3  | sherpa-onnx 在 Electron 里跑起来          | 高       | ✅ 有 prebuilt 包                                                                                                                            | 标准做法，关注打包配置                  |
| R4  | macOS 公证 + native addon 签名            | 高       | ⚠️ 已知复杂                                                                                                                                  | 必须早跑 spike，否则发布前才发现就晚    |
| R5  | mic 和 system 两路音频时间同步            | 中       | ✅ 部分拍板（spike-005 2026-05-23）                                                                                                          | 时钟同步 < 21μs/12s；起点对齐留 T13/T14 |
| R6  | 长录音（2-3h）稳定性                      | 中       | 🤔 待验证                                                                                                                                    | 留到开发阶段压测                        |
| R7  | 全局快捷键 + macOS 辅助功能权限           | 中       | ⚠️ Sonoma+ 需 Accessibility 权限                                                                                                             | 加到 onboarding 流程                    |
| R8  | sherpa-onnx 实测速度满足体验              | 中       | 🤔 待验证                                                                                                                                    | 详见 `sherpa-onnx-research.md`          |

---

## R1 — macOS 系统音 + 麦克风同时录制（audio-only）

### 关键澄清：我们只要 audio，不要 screen

`desktopCapturer` 这个 API 名字带 "desktop" 是历史包袱，**底层在 macOS 上会自动选最优 API**：

| macOS 版本  | 实际走的 API                                     | 权限提示          | 是否需要屏幕录制权限 |
| ----------- | ------------------------------------------------ | ----------------- | -------------------- |
| **14.2+**   | CoreAudio Tap（`AudioHardwareCreateProcessTap`） | 仅麦克风          | **否** ✅            |
| 13.0 – 14.1 | ScreenCaptureKit（SCStream）                     | 麦克风 + 屏幕录制 | 是 ⚠️                |
| < 13        | 无官方方案，需 BlackHole 虚拟设备                | 仅麦克风          | 否                   |

**v0.1 决定**：最低支持 **macOS 14.2+**，只用 CoreAudio Tap 这条干净路径。早于 14.2 的用户在 onboarding 看到不兼容提示。

### 调用方式

```ts
// 1. 拿到一个"system audio source"（实际上 Electron 14.2+ 上是 CoreAudio Tap handle）
const sources = await desktopCapturer.getSources({ types: ['screen'] })

// 2. 把它喂给 getUserMedia 的 audio 约束
const systemStream = await navigator.mediaDevices.getUserMedia({
  audio: { mandatory: { chromeMediaSourceId: sources[0].id } },
  video: false, // 关键：明确不要视频
})

// 3. 麦克风走标准 Web API
const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
```

老的 `chromeMediaSource: 'desktop'` 那一套 macOS 上 **不工作**（长期已知坑，新方案绕开了）。

### Electron 版本要求

- **最低 Electron 42**（CoreAudio Tap loopback 默认启用；35-38 上 `MacCatapLoopbackAudioForScreenShare` 未默认开 → 回退 ScreenCaptureKit 误索屏幕录制权限，2026-05-29 dev 实测踩坑，见 ADR-0001 实测订正）
- **推荐 Electron 39+**（默认走 CoreAudio Tap，可用 `--disable-features=MacCatapLoopbackAudioForScreenShare` 切回 ScreenCaptureKit 做对比测试）

### 不确定点

1. CoreAudio Tap 是否能选 **应用级别** 的音源（如"只录 Zoom"）？还是只能拿"默认输出设备的全混音"？v0.1 我们不需要 per-app，但要记下。
2. 用户**切换音频输出设备**（蓝牙耳机断连、插耳机）时，Tap 是否会断流或自动跟上？
3. 多输出设备（外接声卡 + 内置扬声器同时输出）时，Tap 是哪一个？

### Spike 计划

```
spike-001-macos-dual-audio/
  环境：Electron 39+, macOS 14.2+ (M 系列 + Intel 各一台)
  目标：同时录 mic + system 30 秒，分别存 wav，验证：
    - 两路音频都有内容
    - 采样率（应该是 48kHz stereo）
    - 时间对齐情况（看波形是否对得上）
    - 蓝牙耳机连/断场景的行为
    - 仅触发了「麦克风」权限弹窗，没有「屏幕录制」
  退出条件：两路 wav 都能在 Audacity 听到内容，权限只问了麦克风
  预估：半天
```

### Plan B（万一 CoreAudio Tap 实际跑出来有问题）

按降级优先级：

1. **同样用 Electron 内置 API，但 force 走 ScreenCaptureKit 路径**——可以工作，但要多一个屏幕录制权限。改 prd 添加该权限请求步骤。
2. 写 Swift Native Addon 调 CoreAudio Tap，绕开 Electron 抽象。参考 `audiotee`（GitHub: makeusabrew/audiotee）已经做出来了。
3. 极端情况引入 BlackHole 虚拟声卡作为应急（不推荐，安装体验差）。

---

## R2 — Windows 系统音 + 麦克风

### 现状

- `desktopCapturer` + `chromeMediaSource: 'desktop'` 在 Windows 10/11 **能用**，拿到全系统混音
- 麦克风正常 `getUserMedia({ audio: true })`
- **已知 bug**（[electron/electron#46369](https://github.com/electron/electron/issues/46369)）：在 Win11 上把系统音和窗口选择混在一起会触发渲染进程崩溃。我们的场景是"全系统音"，应该没事，但要确认
- 拿到的是 **全系统混音**（不能选某一个 App 的声音）。Windows 10 2004+ 增加了 per-process loopback，但没有维护良好的 Node 绑定，**v0.1 不做**

### Spike 计划

```
spike-002-windows-dual-audio/
  目标：在 Win11 上跑同样的 dual-recording demo
  退出条件：30 秒录音两路都有内容，不崩
  预估：半天（需要一台 Windows 机器或虚拟机）
```

### Plan B

如果 desktopCapturer 在 Windows 上还是不稳，写 native addon 走 WASAPI loopback。`naudiodon` 可以参考。

---

## R3 — sherpa-onnx 在 Electron 集成

### 现状

- 包：`sherpa-onnx-node@1.13.2`（活跃，今年还在更新）
- 通过 `optionalDependencies` 自动装平台对应的 prebuilt 二进制：
  - `sherpa-onnx-darwin-arm64`（Apple Silicon 原生）
  - `sherpa-onnx-darwin-x64`
  - `sherpa-onnx-win-x64` / `sherpa-onnx-win-ia32`
- 不需要从源码编译
- 详细模型选型、性能数字见 `sherpa-onnx-research.md`

### 打包关键点

- `.node` 文件必须 `asarUnpack`，否则 dlopen 失败
- macOS 上每个 `.node` 文件**单独签名**（hardened runtime + 必要 entitlements），否则公证会过不去
- electron-builder 的 `asarUnpack` 配置示例：
  ```yaml
  asarUnpack:
    - 'node_modules/sherpa-onnx-*/**'
  ```

### Spike 计划

```
spike-003-sherpa-onnx-electron/
  目标：Electron + sherpa-onnx 跑通离线转录一个 wav 文件
  退出条件：能转一段中文音频出文本，时间戳合理
  预估：半天
```

---

## R4 — macOS 公证 + native addon 签名（最容易翻车的点）

### 现状

- App Store Connect API key 已经替代了老的 Apple ID + app-specific password 流程
- 必须配齐的环境变量：`APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`
- 每个 `.node` 文件单独签 hardened runtime
- ONNX Runtime 类的 native 模块 **必须** 加 `com.apple.security.cs.allow-unsigned-executable-memory` 和 `allow-jit` entitlement，否则 app 启动崩溃

### 常见翻车

- "Stapler error 65"：嵌套二进制没签完整
- asar 没解包 native 文件 → dlopen 失败
- Apple Silicon 默认 ad-hoc 签名 → 静默失败，要显式配 `identity`

### Spike 计划

```
spike-004-macos-signing-pipeline/
  目标：用一个 Hello World Electron + 一个 native addon（用 sherpa-onnx-node 就行），
        跑通完整 build → sign → notarize → staple 流程
  退出条件：下载 dmg 安装后能在另一台 mac 启动，spctl --assess 通过
  预估：1 天（含申请 Apple Developer 账号 + API key 的时间）
  前置：需要一个 Apple Developer 账号（$99/年）
```

### 重要：不要等到发布前才做这一步。spike-004 应该和 spike-001 并行。

---

## R5 — Mic 和 System 音轨时间同步

**状态**：✅ 部分拍板（spike-005 2026-05-23）— 采样时钟严格同步（< 21 μs / 12s）；起点对齐验证推迟到 M3 T13/T14。详见 [§spike-005](#spike-005--mic--system-漂移量化2026-05-23)。

### 问题

两路 MediaStream 同时启动，但底层数据到达的时间不完全对齐。会议场景如果偏 200ms 以上，用户播放 mixed.wav 时会感觉"自己说话和对方回应错开了"。

### 验证方法

```
spike-005-track-sync/
  目标：录一段拍手测试（mic 和 system 同时收到拍手声），看波形上的时间差
  方法：用 AudioContext 给两路 stream 加时间戳，记录每个 chunk 的 timestamp，
        最后对齐到 startTime
  退出条件：典型漂移 <50ms（人耳基本不可察觉）
  预估：半天
```

### Plan B

如果漂移超过 100ms，混音前要做对齐处理（在 R5 的 spike 中先量化漂移大小再决定）。

---

## R6 — 长录音稳定性（2-3h）

### 关心的事

- 内存：MediaRecorder 数据缓冲是否持续涨
- 磁盘 I/O：边录边写还是一次性写
- WAV 文件 2 小时 48kHz stereo = 大约 1.3 GB —— 接受还是要压缩？
- 崩溃恢复：电脑睡眠 / 断电 / app 崩溃后能不能拿到部分数据

### 建议

- **边录边切 chunk** 写入磁盘（比如每 30 秒一个 wav 片段，停止时拼接 + 转码）
- 默认输出格式 **wav**（无损），设置里给 "压缩输出" 选项（opus / m4a）
- 崩溃恢复：维护一个 "正在录制" 的元数据文件，启动时检查

### Spike

留到开发阶段做压测，不影响架构。

---

## R7 — 全局快捷键 + 权限

### 现状

- Electron 的 `globalShortcut.register` API 没变
- **macOS Sonoma+ 需要"辅助功能"权限**（不给的话快捷键静默失效）
- 这要加到 onboarding 第 3 步的权限请求里
- Windows 没有额外权限要求，但如果别的 app 占了组合键会静默失败

### 行动

- onboarding 加引导：第一次按快捷键无反应时弹窗解释 + 跳转系统设置
- 设置里显示当前快捷键状态（已注册 / 被占用 / 缺权限）

不需要 spike，但要在 02-design 阶段画到 onboarding 流程里。

---

## Spike 执行顺序建议

| 顺序 | Spike                                                                                                                    | 阻塞下游                | 预估   |
| ---- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------- | ------ |
| 1    | spike-001 macOS 双轨录音                                                                                                 | 整个产品                | 0.5 天 |
| 2    | spike-003 sherpa-onnx 集成                                                                                               | 转录核心                | 0.5 天 |
| 3    | spike-004 macOS 签名公证                                                                                                 | 发布                    | 1 天   |
| 4    | spike-002 Windows 双轨录音                                                                                               | Windows 版本            | 0.5 天 |
| 5    | spike-005 音轨同步量化                                                                                                   | 体验质量                | 0.5 天 |
| 6    | **spike-011 Pass A 引擎选型**（VAD 短窗 SenseVoice vs streaming Zipformer / Paraformer，中文 CER + 延迟 + 内存三轴对比） | Multi Pass 架构定型     | 2 天   |
| 7    | **spike-012 Pass A + 录音并发资源压测**（M1 / Intel Mac / Win i5 三档跑 1h，CPU / 内存 / 电平表手感）                    | Multi Pass 性能预算定型 | 1 天   |
| 8    | **spike-013 hypothesis → confirmed 原地替换 UI 稳定性**（构造模拟数据，验证 segment id 稳定 + 阅读光标不跳行）           | 详情区 UI 实现          | 0.5 天 |

**总计约 7.5 天的技术验证**（Multi Pass 之前约 3 天，加 spike-011/012/013 共 3.5 天）。建议 spike-011/012/013 在 02-design 阶段并行，结果回灌 PRD §7.1 性能预算 + 03-architecture transcription-pipeline。

> **spike-011 是 Multi Pass 架构最关键的输入**：如果 streaming Zipformer 中文 CER 与 SenseVoice int8 差距 < 20%，走 streaming；否则 VAD 短窗 SenseVoice 保底。决策结果直接影响：默认下载模型清单、内存预算上限、Pass A utility 选型。

---

## 阶段退出条件

进入 `03-architecture` 之前：

- [ ] spike-001 通过：macOS 能同时录 mic + system，30 秒 wav 文件可播放
- [ ] spike-002 通过：Windows 同上
- [ ] spike-003 通过：sherpa-onnx 在 Electron 里能转出文本
- [ ] spike-004 通过：完整签名 + 公证流程跑通至少一次（重要：不要拖到最后）
- [x] spike-005 量化漂移：知道 mic/system 之间的典型偏移幅度（部分拍板 2026-05-23；详见 §spike-005）
- [ ] **spike-011 拍板 Pass A 引擎**：streaming Zipformer / VAD 短窗 SenseVoice 二选一，CER + 延迟有量化数据
- [ ] **spike-012 通过资源压测**：录音 + Pass A 并发 1h 在 M1 / Intel / Win i5 都满足 §7.1 预算
- [ ] spike-013 量化 hypothesis 替换稳定性：segment id 在 90% 以上 hypothesis 周期内不变

任何一个 spike 失败 → 回到本文档的 Plan B 重新评估，必要时回到 product-spec.md 调整需求。

**spike-011 失败的退路**（streaming Zipformer 中文 CER 太差 + VAD 短窗延迟太长）：Pass A 默认禁用，UI 显示"实时转录因模型限制暂不可用，请期待 v0.2"，仅保留 Pass B 走通流程——Multi Pass 架构骨架保留，model selection 推迟。

---

## spike-011 — Pass A 引擎选型结果（2026-05-17）

**状态**：✅ done（拍板 → 走 **B 路 VAD 短窗 SenseVoice 伪流式**）
**POC 工作区**：[`scratch/spike-011/`](../../scratch/spike-011/)（代码 in tree，模型 / fixture / results 不进 git）
**决策记录**：[`docs/04-development/adr/ADR-0004-pass-a-engine.md`](../04-development/adr/ADR-0004-pass-a-engine.md)

### 方法学

- **两个候选**：
  - **A. streaming Zipformer**（`sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20`，~190 MB，`OnlineRecognizer`）
  - **B. VAD 短窗 SenseVoice**（`silero-vad-v5` ~0.6 MB + `sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09` ~158 MB，`Vad` + `OfflineRecognizer`）
- **Gold reference**：SenseVoice int8 离线一把推（== Pass B 真实行为）。两路 POC 都用 CER 与 Gold 对照。
- **音频 fixture**：5 段中文音频，来源：
  1. `sense-voice-zh.wav`（SenseVoice tarball 自带）：清晰朗读"开放时间..."5.6s
  2. `streaming-0.wav`：中英混编对话 10.0s
  3. `streaming-1.wav`：英文字母拼读混中文 5.1s
  4. `streaming-2.wav`：含"FREQUENT"等英文单词 4.7s
  5. `streaming-3.wav`：含"YES"等夹杂 8.8s
- **指标**：
  - **CER(POC vs Gold)** = Levenshtein 字符距离 / Gold 字符数（中文按字符、英文按字母统一计）
  - **A 路 tail-latency** = 最后一帧 PCM 推入 → 最终 hypothesis 出现的 wall-clock
  - **B 路 per-segment latency p50 / p95** = VAD endpoint → 该段 ASR 出结果
  - **A 路 hypothesis volatility** = 改写次数 / transition 总数（"改写"指当前 text 不是上一次的纯前缀扩展）
  - **rss 内存峰值** = `process.memoryUsage().rss` 跑分期间峰值
- **节拍**：A 路按 100 ms chunk 喂,B 路按 VAD windowSize（512 samples）喂,均 `await setTimeout` 到下一个实时边界以模拟"边录边推"。
- **硬件**：本机 Apple Silicon（darwin25.3.0 arm64），Node v20.13.1。Intel Mac / Windows 留给 spike-012 复测。

### 测量数据（5 段 fixture 聚合）

| 指标                               | A. streaming Zipformer          | B. VAD 短窗 SenseVoice            |
| ---------------------------------- | ------------------------------- | --------------------------------- |
| 平均 CER vs Gold                   | **26.0%**                       | **9.8%**                          |
| 最差 fixture CER                   | 57.9%（streaming-1）            | 15.8%（streaming-1）              |
| 最好 fixture CER                   | 0.0%（sense-voice-zh）          | 0.0%（sense-voice-zh）            |
| Tail / 段 ASR 延迟                 | 24 ms（avg）                    | p50 64 ms / p95 56 ms（avg）      |
| hypothesis 改写率                  | 0%（只 append,从不改前缀）      | N/A（每段定稿）                   |
| 模型加载后 rss                     | 加载 SZ 后 +332 MB（共 785 MB） | 加载 VAD 后 +0 MB（共 455 MB）    |
| 默认 SenseVoice RTF（M2 CPU int8） | —                               | **0.016**（远超 0.05 的研究预期） |

**关键观察**：

1. **A 路 CER 是 B 的 2.66×**，远超 dev-plan 退出条件里的 < 1.2× 阈值 → **走 B**。
2. A 路 rewrite-rate = 0% — `OnlineRecognizer` 在内部 endpointing 控制下不改写前缀，对视觉稳定性其实有利,但 CER 短板压倒一切。
3. B 路 p95 段延迟 < 110 ms,A 路 tail-latency < 30 ms,**两路都远低于 PRD §7.1 实时字幕 < 3s 的预算** — 延迟不是决策因素。
4. **Pass A 复用 SenseVoice = Pass B 复用 SenseVoice** → M4 默认下载模型清单从原 sherpa-onnx-research §5.4 的 ~270 MB 收缩到 SenseVoice 158 MB + Silero VAD 0.6 MB ≈ **159 MB**;Pass A → Pass B 切换不需要 unload + reload 模型,只是窗口大小改变（短窗 → 全文）。
5. SenseVoice 在 M 系列 CPU 上 RTF = 0.016,**比 sherpa-onnx-research §6.2 的 0.03-0.05 估算还快 2-3×** — Pass B 1h 录音离线全文跑约 1 分钟,Pass A 短窗推理几乎不会成为瓶颈。

### Caveats（写在前面,免得后续误读）

- **Sample size 仅 5 段**,统计置信度弱;但 CER 差距 2.66× 远超阈值,边际不影响结论。spike-012 用真实会议长音频在多机型复测时,数据点会扩到 ≥ 30 段。
- **Fixture 偏教学语料**:streaming-1/2/3 含较多英文字母拼读 + 中英切换,正是 streaming Zipformer 的短板（训练数据偏标准朗读),会议 / 笔记场景实际差距可能略小。但 sherpa-onnx-research §6.2 已指出 streaming Zipformer 整体精度本就低于 SenseVoice offline,定性结论不会翻转。
- **Gold 不是绝对正确**:SenseVoice 把 "OS S" 识别成 "OOS"、"FREQUENT" 识别成 "FREQUNTL" — 影响 CER 绝对值,但因两路 POC 对同一 Gold 比较,**相对差距仍然可信**。
- **B 路 segments 数偏少**:fixture 1/3/4/5 都只切出 1 段 — VAD threshold 0.5 + minSilenceDuration 0.5s 对短音频不敏感。实际录音中分段会更多,p95 段延迟可能轻微上升,但仍远低于 3s 上限。
- **POC 跑在主线程**,T34 实现时 Pass A 跑在 utility process,需重新量化进程间通信开销;spike-012 覆盖。

### 决策

**走 B 路（Silero VAD + SenseVoice 短窗伪流式)**。

- 主因:CER 显著优于 A 路,且本就是 Pass B 用的同一模型,架构 / 内存 / 模型分发都简化。
- 次因:tail-latency 优势对 A 路并不构成翻盘理由,B 路 p95 < 110ms 已达"几秒内出文本"的用户预期。
- 触发的下游影响见 ADR-0004 §后续影响 与本文档 §回写。

---

## spike-010 — 快捷键 → 第一帧 PCM 时延量化（2026-05-17）

**状态**:✅ done(M2 arm64 单机数据;Intel/Win 待 spike-012 时补)
**POC 工作区**:[`scratch/spike-010/`](../../scratch/spike-010/)
**PRD 对接**:[§7.1](./prd.md#71-性能) "快捷键到开始录音 < 500ms(包含浮窗显示)"
**dev-plan 对接**:[T11](../04-development/development-plan.md#3-m3--骨架可跑) "浮窗 100ms 内出现 + 第一帧 PCM"

### 方法学

把 "快捷键 → 第一帧 PCM" 拆两段独立量,避开 globalShortcut 注册（OS 调度延迟 < 10ms,可忽略）:

- **A 段:浮窗显示**。预创建 prep window(`show: false`)常驻 hidden,模拟 production T11 设计;bench 每轮 main 端 `process.hrtime` 取 t0 → `win.show()` → 收到 `'show'` event 取 t1。15 轮 + warmup 一轮丢弃。每轮跑前先 `win.hide()` 并等 `'hide'` event 完整完成,排除 hide/show 同 tick race(Electron 33 在该 race 下 `'show'` 不 fire)。
- **B 段:getUserMedia 第一帧 PCM**。renderer 内 `performance.now()` t0 → `navigator.mediaDevices.getUserMedia({audio:{sampleRate:48000,channelCount:1}})` → `AudioContext` + `AudioWorklet` 加 `pcm-emitter.worklet`(收到第一帧非空 input 立刻 postMessage) → 收到 message 取 t1。10 轮 + warmup,每轮完整 close 上一轮 stream + AudioContext。

### 测量数据(M2 arm64 / macOS 14.x / Electron 33.4.11 / Node 20.18.3)

| 段                                        | n   | min       | p50       | p95        | max       | mean      |
| ----------------------------------------- | --- | --------- | --------- | ---------- | --------- | --------- |
| **A. 快捷键回调 → 浮窗 show event**       | 15  | 12.28 ms  | 31.81 ms  | 46.40 ms   | 46.40 ms  | 34.27 ms  |
| **B. record:start → AudioWorklet 第一帧** | 10  | 166.80 ms | 174.90 ms | 235.00 ms  | 235.00 ms | 181.42 ms |
| **A + B(同分位相加,保守上限)**            | —   | 179.08    | 206.71    | **281.40** | —         | —         |

### 关键观察

1. **PRD §7.1 总预算 500ms 满足**:A + B p95 = 281.40ms,**< 500ms**,留 218ms 余量给 OS compositor 一帧(~16ms @ 60Hz)+ globalShortcut 触发延迟 + production 真实路径(IPC 调度 + 设备未热)。
2. **dev-plan T11 子预算 100ms / 400ms 双双满足**:浮窗 p95 46.4ms < 100ms;第一帧 PCM p95 235ms < 400ms。**浮窗预创建常驻 hidden 是必须的**(本测就是这个模式)— 如果改成"按下快捷键再创建窗口",`new BrowserWindow` + `loadFile` 通常 200-400ms,直接破 100ms。
3. **B 段首轮 235ms 是异常值**:第 2-10 轮 mean 175ms,首轮把 mean 拉到 181。首轮慢于后续 ≈ 60ms,推测是 AudioContext 首次创建 + AudioWorklet 首次 addModule 的解析开销。production 首次录音会命中这条慢路径,p95 应取 235ms 作上限。
4. **B 段没量到 macOS mic 权限对话框阻塞时间**:本机已授权 Electron 访问 mic,首次跑会被对话框阻塞(用户操作时间不可控);PRD §7.1 隐含前提是"权限已授"。Onboarding 流程要保证录音前权限已就位(见 dev-plan T20)。

### Caveats

- **单机型数据**:M2 arm64 / macOS 14.x。Intel Mac / Win i5 未测(无机器)。spike-012 三档压测时同步补这两个平台的快捷键 → PCM 数据。Windows WASAPI loopback 路径下 B 段可能更慢(没 AudioWorklet 直通,要走 desktopCapturer)。
- **A 段量的是 main 进程 `'show'` event**,**不是用户视觉感知**:OS compositor 还要一帧才把窗口合成到屏幕。但 16ms 是固定 OS 开销,加上去仍 < 100ms。
- **A 段第一次和后续耗时差不大**(warmup 57ms vs round mean 34ms),说明 NSWindow show 路径没有大的冷启动开销。production 浮窗常驻 hidden 后,真实第一次快捷键 show 应在 50ms 内。
- **B 段每轮都重新 getUserMedia + AudioContext**,模拟"按一次录一次"的最差路径。production 实际场景可能复用 AudioContext + 长期持有 stream(尤其录制中状态),那时第一帧延迟应更低。
- **样本小**(A=15 / B=10),p95 实际等于 max,统计上限不严谨。但中位数稳定 + 没有长尾,主结论不依赖样本量。

### 决策

**T11 浮窗 100ms / 第一帧 PCM 400ms / PRD §7.1 总预算 500ms 在 M2 上有充足余量,可走 T11/T12 实施**。

- 浮窗**必须预创建常驻 hidden**(本测前提)。T11 实现按这个模式做。
- AudioContext / AudioWorklet 首次加载有 ~60ms 额外开销,T12 可考虑在 app 启动后预加载一个空 AudioContext + worklet module,把首录延迟再砍掉(优化项,非必须)。
- Intel Mac / Win i5 数据 ⏳ 等 spike-012 时补;如果任一平台破预算,触发 dev-plan §10.2 砍 scope(降级"录前预热"或调整 PRD §7.1 阈值)。

---

## spike-005 — mic / system 漂移量化（2026-05-23）

**状态**：✅ done（**部分结论拍板**；起点对齐验证推迟到 M3 T13/T14 真实录音场景）
**POC 工作区**：[`scratch/spike-005/`](../../scratch/spike-005/)（代码 in tree，wav/meta 不进 git）
**测试环境**：M2 arm64 / macOS 26.5 Tahoe / Electron 42.2.0 / Node 22.22.3 / ad-hoc 签名
**对接**：[`R5`](#r5--mic-和-system-音轨时间同步) 退出条件 + [`audio-capture.md` §6.2](../03-architecture/audio-capture.md) 混音注脚

### 方法学

ScreenCaptureKit audio-only 路径（macOS 14.4+）+ 同一 AudioContext 接 mic + system 两路：

1. 主进程 `setDisplayMediaRequestHandler` 只回 `{ audio: 'loopback' }`（不带 video），renderer `getDisplayMedia({ video: false, audio: true })` → 对应"System Audio Recording Only"权限组，不需要 Screen Recording 全权限
2. 两路 `MediaStream` 都接同一 `AudioContext(sampleRate: 48000)` 的 `AudioWorkletNode`（自定义 `tap` processor，每 128-frame block 通过 transferable 回主线程）
3. 主进程生成 12s reference.wav（6 个 5ms 1kHz Hann 窗 click @ 1.5s 间隔），`afplay` 默认扬声器播放
4. mic 路收声学路径（speaker → 空气 → mic ≈ 0.9ms / 30cm）；system 路收数字回环（ScreenCaptureKit loopback）
5. 离线 Node CLI 用 2ms 窗 RMS envelope 在每个 click expected 时刻 ±0.3s 窗口找峰值，算 `mic.peakSec - sys.peakSec`
6. analyze 逻辑自带 smoke：注入已知 17.2ms drift → 检测 17.188ms，误差 0.012ms（< 2ms 阈值）

### 测量数据（3 run × 12s × 6 click，M2 arm64 / macOS 26.5）

| 维度                              | 结果                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------ |
| Electron 42 audio-only SCKit 桥接 | ✅ 通；handler 被调用，sys maxAbs = 1.0                                        |
| 3 run 每路 chunks 数              | run1 4562/4562, run2 4566/4566, run3 4564/4564 — **mic 与 sys 完全一致**       |
| 3 run 每路总 frames               | run1 583936/583936, run2 584448/584448, run3 584192/584192 — **逐 frame 对齐** |
| 3 run 时长差（mic - sys）         | 0.000 / 0.000 / 0.000 sec — **<< 1/48000 ≈ 21 μs**                             |
| sys 路 reference click 检出       | 18/18，每个峰值在 expected 时刻 ±5ms 内                                        |
| mic 路 reference click 检出       | 0/18（spike 设备合盖，内置 mic 物理拿不到 click）                              |

### 关键观察

1. **两路同 AudioContext capture 的采样时钟同步精度 < 21 μs**：每次 run mic 和 system 的 chunk 数和总 frame 数严格一致（精确到单 sample），表明 M2 上 mic capture device 与 ScreenCaptureKit audio loopback 共享同一 CoreAudio 时钟域，AudioContext resample 后没有 ppm 级累积漂移。12s 内时长差 = 0 sample。
2. **采样长度对齐 ≠ 起点对齐**：长度一致只能证明两路时钟跑得一样快，**不能证明两路起始时刻对齐**。理论上 mic 启动可能比 sys 晚 N ms，但 mic stream 会提供前 N ms 的 0 padding 让最终长度对齐 — 这种情况下 mixdown 会有起点错位。要测真起点对齐必须 mic 也收到 ground truth click（被合盖阻断，本 spike 没拿到）。
3. **macOS 14.4+ audio-only ScreenCaptureKit 路径走通**：Electron 42 + `getDisplayMedia({video:false,audio:true})` + main handler 只回 audio loopback，对应"System Audio Recording Only"权限组。**这是生产代码采集 system audio 的推荐路径**（不要求 Screen Recording 全权限，用户授权门槛低）。
4. **结论与原架构假设一致**：[`audio-capture.md` §6.2 注脚](../03-architecture/audio-capture.md) "不做对齐 / 漂移补偿；spike-005 量化漂移 < 50 ms，人耳基本不可察觉。一旦实测漂移超 100 ms 再补对齐逻辑" 仍然成立 — 数据没否定它。

### Caveats / 推迟到 M3 验证的部分

- **mic vs sys 起始时刻对齐没拿到数**：spike 设备合盖，内置 mic 物理静音；外接 mic + 拍手测试 / 用 BlackHole 让 mic 走数字回环这两条 fallback 都没做。**推迟到 M3 T13/T14 实施真实录音 + mixdown 时验证**：拿真录音文件 mixed.wav 听感测试，如果听感"自己说话和对方错开" > 100ms 再触发 Plan B。
- **样本量小**：3 run × 12s = 36s 总采样，没覆盖长录音（30min+）下硬件时钟可能的累积漂移。spike-006（如开）或 M3 T14 mixdown 完整性测试需要覆盖这块。
- **环境限制写明**：本 spike 数据只对 M2 arm64 + macOS 26.5 + ad-hoc 签名 Electron 有效。Windows / Intel Mac 路径在 spike-002 已分别验过录音可行性，但漂移量化没做（按硬件硬约束，无 Intel/Win 设备，留 M3 跨平台 smoke 阶段）。

### 决策

1. **生产 system audio 采集走 audio-only ScreenCaptureKit 路径**（不是 Screen Recording 全权限路径）— renderer `getDisplayMedia({video:false,audio:true})` + main `setDisplayMediaRequestHandler` 回 `{audio:'loopback'}`。**注意**：不要传 `useSystemPicker: true`，会让 Chromium 在 handler 之前做 TCC 检查并按 screen=denied 短路。M3 T12 实施时按这套写。
2. **沿用 audio-capture.md §6.2 注脚**：不做对齐补偿，直接 sum/平均混音；起点对齐验证延后到 M3 T13/T14 真实录音场景，T14 AC 加一条"30min 录音 mixed.wav 听感 mic 与 system 同步、无明显错位"。
3. **dev-time 工具链需求落地**（spike 实操副产品，影响 T01 决策）：
   - Node 基线 ≥ **22.x**（Electron 35+ 用 ESM `@electron/get@5`，Node 20 `require(esm)` 不支持 → 装 Electron postinstall 直接挂）；T01 `.nvmrc` 写 `22`
   - dev 时 Electron.app 必须 **ad-hoc 签名**（`codesign --force --deep --sign - node_modules/electron/dist/Electron.app`），否则 macOS 26 Tahoe TCC 直接 `screen=denied` 不弹框
   - 影响 T01-T02 脚手架：postinstall hook 加 ad-hoc sign 步骤；CI mac job 也要

### Plan B（如果 M3 T13/T14 验证起点偏差 > 100ms）

按原 [`R5` Plan B](#r5--mic-和-system-音轨时间同步)：在 mixdown 前做对齐处理。具体做法 M3 T14 实施时再设计（最简：用 capture session 启动时刻作零点 + 每路 stream 的 first-frame-time 记录差值，mixdown 时按差值 padding/裁剪）。

---

## spike-013 — hypothesis → confirmed 替换 UI 稳定性(2026-05-17)

**状态**:✅ done(B 策略 segment id 稳定率 = 100%,远超 90% 退出条件)
**POC 工作区**:[`scratch/spike-013/`](../../scratch/spike-013/)
**dev-plan 对接**:[T35](../04-development/development-plan.md#43-m4--本地转录跑通t30-t40) "hypothesis → confirmed 视觉" + AC "录音中观察 → 不跳行 / 不闪烁"

### 方法学

把同一条 ASR mock 数据流并排喂两个 React panel,两个 panel 用不同的 segment key 策略,React 用 `key` 决定是否复用 DOM:

- **A. content-hash key**:`key = djb2(seg.text)`。文本任意改写都让 key 变 → React 把这个 segment unmount + remount → DOM 重建 → 视觉闪烁 + 阅读光标跳行。
- **B. timestamp-start key**:`key = seg.startMs`。VAD 切窗时 `startMs` 一次确定,后续 ASR 多轮改写 `text` 不影响 key → React 复用同一 DOM 节点,只更新内文。

ASR mock 还原 Pass A 实际行为:每 250ms 推一帧,共 21 帧、4 个 segment(startMs 0/2000/4000/6000),
途中 segment 在 hypothesis 状态被改写(`产品 → 项目`、`数据 → 指标`、`留存数据 → 留存率`、`留存率 → 留存率提升了百分之十二`),
然后转 confirmed 定稿。React **关闭 StrictMode**(`scratch/spike-013/src/main.tsx`)避开 dev 双触发 effect,
量真实 mount/unmount。

### 测量数据(21/21 帧跑完)

| 指标                         | A. content-hash key | B. timestamp-start key   |
| ---------------------------- | ------------------- | ------------------------ |
| 总 segment-update 次数(分母) | 59                  | 59                       |
| 唯一 key 数                  | **22**              | **4**(= 真实 segment 数) |
| mount 总数                   | 22                  | **4**                    |
| **unmount 总数**             | **18**              | **0**                    |
| 渲染次数(setState 触发)      | 59                  | 59                       |
| **segment id 稳定率**        | —                   | **100.0%**               |

### 关键观察

1. **B 策略 segment id 稳定率 = 100%,远超 spike 退出条件 90%**:整段 21 帧期间,每个 segment 只 mount 一次、0 unmount,React DOM 完全复用 → hypothesis 反复改写时**只是 textContent 在变,节点本体不变** → 视觉上不闪烁、不跳行。
2. **A 策略 unmount 数 = 18**:18 次 segment 文本改写各触发一次 unmount+mount。production 上等价于"每次 ASR 推新 hypothesis 都让对应 DOM 闪一下" → PRD F4.5 "hypothesis 阅读体验" 直接破。
3. **唯一 key 数对比 22 vs 4**:A 策略下唯一 key 数 = 总 mount 数,说明 hash 把每一次内容变化当成"新 segment";B 策略稳定锁在 4 个 segment,**精确对应 VAD 切窗的真实 segment 数**。
4. **Pass A 输出契约要求**:Pass A engine(Silero VAD + SenseVoice,见 spike-011 / ADR-0004)必须在 VAD 切窗一刻就发出稳定的 `startMs`,后续同段 ASR 改写不能换 `startMs`。这个契约在 [transcription-pipeline.md](../03-architecture/transcription-pipeline.md) 里要明写。

### Caveats

- **没量到 OS 合成器层的视觉闪烁**:本测靠 React mount/unmount 计数作"DOM 重建"的代理。production 实际视觉是否还能感知到"DOM 复用 + textContent 更新" 的过渡,要在 T35 实施时做真实视觉验证(配 framer-motion / view-transition,或 200ms accent 高亮过渡)。
- **mock 数据是确定性脚本**,不是真 ASR 的概率性输出。production 中 Pass A 改写频率 / 段长 / 段数都不同,但 React key 稳定性是**纯结构性结论**,不依赖统计分布。
- **B 策略要求 ASR engine 暴露稳定 `startMs` 字段**。如果某个 engine 只暴露段文本不暴露 startMs(早期 streaming-only 模型可能这样),要走 segment id allocator 给每段第一次见时分配本地稳定 id。spike-011 已拍 Silero VAD,VAD windowStart 是稳定的时间戳,契约满足。
- **样本 = 单条 mock 脚本**(21 帧 / 4 段)。production 录音可能 100+ 段,key 数量级上来后 React 渲染本身的性能要看 T35 + T39(虚拟列表)如何处理 — 那是 M3-M4 优化的事,不在 spike-013 scope 内。

### 决策

**T35 / 详情区 hypothesis 渲染采用 B 策略 — `key = seg.startMs`**。

- Pass A engine 输出契约新增硬性要求:每个 segment 在第一次发出时绑定 `startMs`,后续同段改写不变。
- transcription-pipeline.md 要回写这条契约(本 PR 暂只在 tech-feasibility 写结论,03-architecture 改动留给 T35 实施 PR 一并做,避免现在引入 unused 字段)。
- T35 AC 加一条:"hypothesis 反复改写期间,DOM mount 数 = 段数"(测试侧可用 mount counter 验)。

## spike — 流式 zh-zipformer + 热词 vs SenseVoice(2026-06-10)

**状态**:❌ 否决(换模型 / 原生热词均不划算,留 SenseVoice + 后处理术语表)
**起因**:SenseVoice 是 CTC,原理上不支持热词(sherpa-onnx 只有 transducer + modified_beam_search 支持)。想验「换支持热词的流式 zh-zipformer transducer」能否在 dogfood 上打平 SenseVoice 且热词救专有名词。
**配套**:`scripts/spike-online-zh-hotwords.ts`(greedy/`--beam`/`--hotwords` 三档),CER 复用 `scripts/eval-lib.ts`(= 校准基线口径)。模型 `sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30`(multi-zh-hans,char-based)。

### 数据(dogfood 5 段,校准 CER:数字归一 + 语气词剥除)

| 样本                  | SenseVoice | zh greedy | zh beam+热词 |
| --------------------- | ---------- | --------- | ------------ |
| kunyuan_cpo           | **4.4%**   | 6.9%      | 6.0%         |
| roundtable_kunlun     | 13.7%      | 13.4%     | **13.0%**    |
| roundtable_sanxingdui | **13.4%**  | 13.4%     | 13.1%        |
| wizard_lisa           | **17.6%**  | 21.6%     | 21.2%        |
| wizard_trump          | 28.2%      | 28.5%     | **27.7%**    |
| **平均**              | **15.4%**  | 16.8%     | 16.2%        |

RTF:SenseVoice 0.017 / zh greedy 0.040 / zh beam 0.067(均 M2 arm64 int8)。

### 关键观察

1. **换模型不划算**:zh-zipformer 即便 modified_beam_search(16.2%)仍输 SenseVoice(15.4%)。纯中文也没赢——kunyuan 反而差 2.5 点,圆桌打平。
2. **该模型无英文词表**(tokens.txt 0 个英文 token,英文走 byte-fallback):wizard_lisa/trump 英文名段更差,符合预期。SenseVoice 多语种(zh-en-ja-ko-yue)是真优势。
3. **热词对我们的目标词完全失效**:想 bias 的「巫师 / 昆仑 / 三星堆」这些字不在 token 词表(byte-fallback 表示),热词编码器 `EncodeBase` 直接报 "Cannot find ID for token 巫" 并跳过。能编码的(光模块/立讯精密/创业板)本来就识别正确。beam+热词 比 greedy 好的 0.6 点纯来自 beam search,与热词无关(实测召回提升来自 beam 多探路径)。
4. **推广教训**:char-based zh transducer 对**生僻字 / 人名**(恰恰是最想 bias 的词)往往只有 byte-fallback 覆盖,无法作为热词编码——热词在这类模型上对专有名词的价值远低于预期。

### 决策

- **v0.1 保持 SenseVoice + 后处理术语表**(§6.2.5)。术语表在 JS 侧做「错→对」替换,不受模型 token 词表限制,正是这条 spike 暴露的热词短板的解法。
- 不引入第二个 ASR 模型;不为热词换主模型。
- 留备选(P2,需新数据触发):若未来要原生热词,得选**词表含目标词、且支持热词**的 transducer(还要兼顾英文)——当前 sherpa 模型库里没有同时满足的。
