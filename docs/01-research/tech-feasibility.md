# 技术可行性验证

> 目标：在写第一行代码之前，把"如果这个走不通，整个产品形态要重做"的关键技术风险识别 + 验证 + 退路想清楚。

## 风险登记表（Risk Register）

| ID  | 风险                                      | 严重性   | 当前判断                                                            | 建议                                 |
| --- | ----------------------------------------- | -------- | ------------------------------------------------------------------- | ------------------------------------ |
| R1  | macOS 同时录系统音 + 麦克风（audio-only） | **致命** | ✅ Electron 35+ 内置走 CoreAudio Tap（macOS 14.2+），仅需麦克风权限 | **低风险**，跑 spike 确认            |
| R2  | Windows 同时录系统音 + 麦克风             | **致命** | ⚠️ 能录但有已知 bug                                                 | 需 spike 验证当前 Electron 版本      |
| R3  | sherpa-onnx 在 Electron 里跑起来          | 高       | ✅ 有 prebuilt 包                                                   | 标准做法，关注打包配置               |
| R4  | macOS 公证 + native addon 签名            | 高       | ⚠️ 已知复杂                                                         | 必须早跑 spike，否则发布前才发现就晚 |
| R5  | mic 和 system 两路音频时间同步            | 中       | 🤔 待验证                                                           | spike 中量化漂移幅度                 |
| R6  | 长录音（2-3h）稳定性                      | 中       | 🤔 待验证                                                           | 留到开发阶段压测                     |
| R7  | 全局快捷键 + macOS 辅助功能权限           | 中       | ⚠️ Sonoma+ 需 Accessibility 权限                                    | 加到 onboarding 流程                 |
| R8  | sherpa-onnx 实测速度满足体验              | 中       | 🤔 待验证                                                           | 详见 `sherpa-onnx-research.md`       |

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

- **最低 Electron 35**（CoreAudio Tap loopback 默认开启）
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
- [ ] spike-005 量化漂移：知道 mic/system 之间的典型偏移幅度
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
