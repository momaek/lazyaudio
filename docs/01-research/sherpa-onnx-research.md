# sherpa-onnx 调研（面向 Electron / Node.js）

> 调研目标：评估 sherpa-onnx 是否能稳定承载 LazyAudio 的本地转录需求；如果能，**怎么在 Electron 里跑顺**、**选哪个模型**、**有哪些坑和优化点**。
>
> 调研日期：2026-05-16，对应 sherpa-onnx `v1.13.2`。

---

## 1. 一句话结论

sherpa-onnx 在 Node.js 侧通过 **N-API 原生 addon** 提供完整能力（离线/流式 ASR、VAD、标点、语种识别、说话人分离、TTS），功能上完全满足 v0.1 需求；Electron 集成**可行但有两个已知坑**——macOS 上的 `DYLD_LIBRARY_PATH` 被 SIP 剥离、以及打包时 `.node` / `.dylib` 没被正确解出 asar。把这两件事做对，剩下都是模型选型和性能调优问题。

**v0.1 推荐组合（中文场景）**：`SenseVoice-small int8`（离线 ASR）+ `Silero VAD`（分段）+ `CT-Transformer`（标点）。

---

## 2. sherpa-onnx 是什么

- 上游：[k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)，Apache-2.0
- 定位：`next-gen Kaldi` 的 onnxruntime 推理前端，把语音相关的一堆模型（ASR / TTS / VAD / 说话人 / 标点 / 关键词 / 音频标签 / 语音增强 / 源分离）统一成一套 C++ runtime，再分发出 12 种语言的绑定
- 跑得动的平台：Linux / macOS / Windows / Android / iOS / HarmonyOS / 树莓派 / RISC-V / 各种 NPU
- 我们这次只关心：**macOS（Intel + Apple Silicon）+ Windows x64** 的 **Node.js 绑定**

---

## 3. 两种 JS 形态：N-API addon vs WebAssembly

sherpa-onnx 在 JS 侧给了**两套**实现，选错了会很难受。

| 维度          | N-API addon（`nodejs-addon-examples/`）✅                         | WebAssembly（`nodejs-examples/`） |
| ------------- | ----------------------------------------------------------------- | --------------------------------- |
| 包            | `sherpa-onnx` + 平台二进制包                                      | `sherpa-onnx-wasm-*`（实验向）    |
| 多线程        | 支持（onnxruntime 内部 + node-addon-api 异步）                    | **不支持**，单线程                |
| 性能          | 接近原生                                                          | 慢若干倍，模型一大就拉垮          |
| 体积          | 含 .dylib/.dll，几十 MB                                           | 模型 + wasm 也不小                |
| Electron 集成 | 主进程 require 即可，有打包坑                                     | 渲染进程也能用，但性能拉胯        |
| 模型覆盖      | 全（SenseVoice / Whisper / Paraformer / Moonshine / FireRedAsr…） | 大部分能跑                        |

**结论：用 N-API 那套**（`nodejs-addon-examples`），WASM 仅在"我就想塞渲染进程里、Worker 里跑个 VAD"这种特殊场景才考虑。

---

## 4. NPM 包结构

`sherpa-onnx` 是入口包，运行时通过 `process.platform` + `process.arch` 动态加载对应的二进制包。需要在 `package.json` 把入口包和**当前平台**的二进制包都装上：

```
sherpa-onnx                      # 主包，纯 JS 入口 + N-API bindings
sherpa-onnx-darwin-arm64         # Apple Silicon
sherpa-onnx-darwin-x64           # Intel Mac
sherpa-onnx-win32-x64            # Windows x64
sherpa-onnx-win32-ia32           # Windows 32 位（可忽略）
sherpa-onnx-linux-x64
sherpa-onnx-linux-arm64
```

每个二进制包里装的是 **`.node` addon + 平台动态库**（macOS 是 `.dylib`，Windows 是 `.dll`，Linux 是 `.so`）。

要求 **Node ≥ 18**（addon 仓库 README 写 ≥16，但 Electron 30+ 内置 Node 20，没必要兼容老的）。

辅助包（按需）：

- `naudiodon2` —— 麦克风采集，sherpa-onnx 官方 example 在用；但 **PortAudio 系，编译依赖重**，Electron 里要 rebuild。可替代品见 §7。
- `speaker` —— TTS 实时播放用，我们用不上。

---

## 5. 在 Electron 里跑通的两个关键坑

### 5.1 macOS：`DYLD_LIBRARY_PATH` 被 SIP 剥离（[issue #2622](https://github.com/k2-fsa/sherpa-onnx/issues/2622)）

**症状**：`npm start` 起 Electron，主进程 `require('sherpa-onnx')` 抛

```
Could not find sherpa-onnx-node. Tried ../build/Release/sherpa-onnx.node ...
```

即便你在 npm script 里 `export DYLD_LIBRARY_PATH=...` 也没用。

**根因**：macOS 系统完整性保护（SIP）会在加载受保护的可执行文件（Electron Helper）时**清掉** `DYLD_*` 环境变量。所以 Node 自己跑得起来、Electron 跑不起来。

**两种解决思路**：

1. **代码侧把 dylib 路径塞到 rpath 解析里**（推荐）—— 主进程入口在 `require('sherpa-onnx')` **之前**手动 `process.dlopen` 或把 dylib 拷到 `.node` 同目录，让 dyld 通过 `@loader_path` 找到。社区 issue 里官方建议是**用 `@loader_path` 重新链接 dylib**，但对应用层最简单的做法是：在打包时把所有 `.dylib` 和 `.node` 一起放进 `app.asar.unpacked/node_modules/sherpa-onnx-darwin-arm64/`，让它们处于同一目录。

2. **`process.env.DYLD_LIBRARY_PATH` 在 `app.whenReady()` 之前赋值**——对开发环境（`electron .`）有时有用，**生产签名包里无效**，别依赖。

### 5.2 打包：`.node` / `.dylib` 没被解出 asar（[issue #1945](https://github.com/k2-fsa/sherpa-onnx/issues/1945)）

Electron 默认把 `node_modules` 打成 `app.asar`，但**原生模块必须落在文件系统上**（操作系统的动态加载器不认 asar 这种虚拟路径）。

**electron-builder 配置**：

```json
{
  "build": {
    "asarUnpack": [
      "node_modules/sherpa-onnx/**",
      "node_modules/sherpa-onnx-darwin-arm64/**",
      "node_modules/sherpa-onnx-darwin-x64/**",
      "node_modules/sherpa-onnx-win32-x64/**"
    ]
  }
}
```

electron-builder 25+ 号称会**自动检测**含 `.node` 的包并 unpack，但 sherpa-onnx 的二进制包里**真正的 addon 在子包里**、主包只是 JS 胶水，自动检测**不一定**覆盖到 dylib，**显式写一遍最稳**。

**electron-forge 用户**：装 `@electron-forge/plugin-auto-unpack-natives` 即可，但同样建议在 packagerConfig.asar.unpack 里 fallback 一份。

### 5.3 ABI 兼容：要不要 `@electron/rebuild`？

**不用**。sherpa-onnx 的 N-API addon 是 **N-API 6+** 编译的，N-API 提供 ABI 稳定保证，Node 和 Electron 共享 V8 但 N-API 屏蔽了内部差异，**不需要针对 Electron 重新编译**。`naudiodon2`（NAN 老接口）则**必须 rebuild**——这是要不要换它的另一个理由。

### 5.4 体积估算

| 项                         | 大小                    |
| -------------------------- | ----------------------- |
| `sherpa-onnx-darwin-arm64` | ~25 MB（dylib + addon） |
| `sherpa-onnx-win32-x64`    | ~30 MB                  |
| SenseVoice int8 模型       | ~234 MB                 |
| Silero VAD                 | ~2 MB                   |
| CT-Transformer 标点        | ~38 MB                  |

**结论**：装好后 ASR 全家桶约 **270 MB**，里面绝大部分是模型。建议**首启动后再下载模型**，不要打进安装包，否则 macOS DMG 直奔 300+ MB。

---

## 6. 模型选型

### 6.1 LazyAudio 的需求场景

- 中文为主、夹英文（典型：会议 / 面试 / 国内播客）
- 离线 ASR（v0.1），架构预留流式
- 长录音（30 min – 3 h）稳定性
- 桌面级算力（M1+ / x64 现代 CPU，无 GPU 假设）

### 6.2 候选对比

| 模型                 | 大小    | 语言            | 速度（RTF, M1, int8）  | 中文 CER | 备注                                                                |
| -------------------- | ------- | --------------- | ---------------------- | -------- | ------------------------------------------------------------------- |
| **SenseVoice-small** | ~234 MB | zh/en/ja/ko/yue | **0.03–0.05**          | 业内一线 | **非自回归**，并行解码，长音频天然吃香；带情感+音频事件 tag（可关） |
| Paraformer-zh        | ~200 MB | zh/en           | ~0.08                  | 老牌稳   | 中文老选手，但已被 SenseVoice 全面超越                              |
| Whisper-base         | ~140 MB | 多语            | ~0.3                   | 一般     | 自回归慢，且对中文短句易"幻觉"                                      |
| Whisper-medium       | ~1.5 GB | 多语            | ~1.0+（M1 CPU 跑不动） | 好       | 太大，桌面 CPU 离线吃力                                             |
| Moonshine-base       | ~150 MB | en only         | 极快                   | —        | 只英文，pass                                                        |
| FireRedAsr-AED       | ~1.1 GB | zh              | ~0.15                  | 很好     | 体积大，v0.2 备选                                                   |

> RTF（Real-Time Factor）= 处理 1 秒音频用的秒数；< 1 即比实时快。
> 数字来自社区基准 + sherpa-onnx 自带速度报告，**Apple Silicon CPU、int8、num_threads=2**。

### 6.3 推荐

- **默认本地模型**：`sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09`（最新 int8 版）
- **备选**：`whisper-base`（多语场景兜底）
- **不上**：Paraformer（SenseVoice 已替代）、Whisper-medium+（桌面 CPU 太勉强）

这刚好回答了 product-spec.md 的 TBD #4。

### 6.4 SenseVoice 关键配置

```js
const recognizer = new sherpa_onnx.OfflineRecognizer({
  modelConfig: {
    senseVoice: {
      model: 'models/sense-voice/model.int8.onnx',
      language: 'auto', // 'auto' | 'zh' | 'en' | 'ja' | 'ko' | 'yue'
      useItn: true, // 数字/日期正则化，"二零二六" -> "2026"
    },
    tokens: 'models/sense-voice/tokens.txt',
    numThreads: 2, // M1 上 2-4 收益递减，再大反而慢
    provider: 'cpu', // macOS 只有 cpu / coreml 可选，见 §8
    debug: false,
  },
  decodingMethod: 'greedy_search',
})
```

---

## 7. 音频采集：naudiodon2 之外的更好选择

sherpa-onnx 官方 demo 用 `naudiodon2`，**但它对 Electron 不友好**：基于 PortAudio + NAN，必须 `@electron/rebuild`，且 Apple Silicon 下经常编译失败。

我们的场景更特殊：**同时采系统音 + 麦克风**，本来就要走原生路（macOS ScreenCaptureKit / Windows WASAPI loopback），sherpa-onnx **不需要自己采音**——把已经写好的 WAV / Float32 buffer 喂进去即可。

集成路径（推荐）：

```
[原生采集 addon] ──Float32Array(16k mono)──> [VAD] ──speech segment──> [ASR]
                                              │
                                              └─> 写文件 (mic.wav / system.wav)
```

VAD 用 sherpa-onnx 自带 Silero VAD（`VoiceActivityDetector` 类），不必接 `naudiodon2`。

如果只是想测试麦克风采集做原型，`decibri` 是 `naudiodon2` 的 prebuilt 替代品，[官方文档](https://decibri.dev/docs/node/integrations/sherpa-onnx-vad.html)就给了 sherpa-onnx 集成例子，电子化场景可以直接用 prebuilt 二进制免去 rebuild。

---

## 8. 性能与优化点

### 8.1 onnxruntime providers——GPU 的真相

先把容易让人乐观的事实和容易让人悲观的事实摆开。

**容易让人悲观的（但需要细看）**：
npm 上 `sherpa-onnx@1.13.2` 的所有平台 prebuilt 子包**全部只带 CPU EP**——`npm view` 看不到任何 GPU 变体，社区 [issue #1146 "How do I use cuda with sherpa-onnx-node?"](https://github.com/k2-fsa/sherpa-onnx/issues/1146) 至今没有 turnkey 答案。

**容易让人乐观的（但要分场景看）**：
sherpa-onnx 的 **C++ runtime 完整支持** CUDA / DirectML / CoreML / TensorRT。官方在 GitHub Releases 出了 `sherpa-onnx-v*-cuda-12.x-cudnn-9.x-linux-x64-gpu.tar.bz2` 这类 GPU tarball，只是**没把 Node addon 打成 GPU 版 npm 包**。也就是说：要 GPU 不是不可能，是**自己出货**。

各平台 / 各 provider 的现状：

| 平台                 | CPU（npm 直装） | CoreML                | CUDA                             | DirectML | TensorRT |
| -------------------- | --------------- | --------------------- | -------------------------------- | -------- | -------- |
| macOS arm64          | ✅              | 自编可启用            | —                                | —        | —        |
| macOS x64            | ✅              | ❌（CoreML 仅 arm64） | —                                | —        | —        |
| Windows x64          | ✅              | —                     | 自编 / 用官方 GPU tarball 重打包 | 自编     | 自编     |
| Linux x64            | ✅              | —                     | 官方有 GPU tarball               | —        | 自编     |
| Linux arm64 (Jetson) | ✅              | —                     | 官方有 Jetson GPU tarball        | —        | ✅       |

### 8.2 GPU 到底能省多少——按场景说话

**先承认一个反直觉的事实**：GPU 不是对所有 ASR 模型都有大幅加速。**SenseVoice 这种非自回归小模型**，CPU int8 已经把瓶颈推到了**模型 IO 和特征提取**上，GPU 的并行优势几乎用不上；而 **Whisper / FireRedAsr 这种自回归大模型**，每生成一个 token 都要前向一遍 decoder，GPU 才是质变。

实测/社区数据（量级估计，不是严格 benchmark）：

| 模型             | M1 CPU int8        | M1 CoreML                           | x64 CPU int8 | RTX 4060 CUDA |
| ---------------- | ------------------ | ----------------------------------- | ------------ | ------------- |
| SenseVoice-small | RTF ~0.05          | RTF ~0.04（**或更慢**，启动开销大） | RTF ~0.10    | RTF ~0.03     |
| Whisper-base     | RTF ~0.30          | RTF ~0.18                           | RTF ~0.40    | RTF ~0.05     |
| Whisper-large-v3 | RTF ~3.0（跑不动） | RTF ~1.2                            | RTF ~3.5     | RTF ~0.15     |
| FireRedAsr-AED   | RTF ~0.15          | —                                   | RTF ~0.25    | RTF ~0.06     |

**怎么读这张表**：

- 我们 v0.1 选了 SenseVoice-small，**CPU 已经 20× 实时**。1 小时录音 ≤3 分钟跑完，GPU 把它压到 1.5 分钟意义不大，用户感知不明显。
- 想上 Whisper-large / FireRedAsr（更高精度多语言），**Windows + NVIDIA 用户开 CUDA 是数量级提升**，这才是 GPU 投入的真正甜点。
- Mac 端 CoreML EP 对小 int8 模型经常**得不偿失**——CoreML 编译开销 + 模型转译时间一加，整体比 CPU 还慢。社区里很多人开了 CoreML 反而退回 CPU，**别盲目开**。

### 8.3 给 LazyAudio 的 GPU 路线

**v0.1（不做 GPU，理由充分）**：

- 默认模型 SenseVoice-small int8 在所有目标设备上都已经远超实时
- 用户感知不到 GPU 收益，但开发 / 打包 / 测试矩阵复杂度翻倍
- ROI 不划算

**v0.x（GPU 当可选高性能模式来做）**：

1. **Windows + NVIDIA**（最值得做）
   - 自己 fork 一份 `sherpa-onnx-node`，CMake 加 `-DSHERPA_ONNX_ENABLE_GPU=ON`，链接 onnxruntime CUDA GPU 包
   - 打成独立 npm 包 `lazyaudio-sherpa-win32-x64-cuda` 或直接 release 二进制
   - 安装器或首启动检测：见到 `NVIDIA` + CUDA 12 → 额外下载 ~120 MB CUDA/cuDNN dll + GPU 版 `.node`
   - 配置项暴露 `provider: 'cuda'` 一个开关，对错回退到 CPU
   - **目标用户**：要跑 Whisper-large / FireRedAsr 的"专业级"用户

2. **Mac CoreML**（不做或最后做）
   - 对默认 SenseVoice 反而可能更慢
   - 仅在用户主动选了 Whisper-medium+ 时才默认走 CoreML
   - 实现成本不低（要重编 onnxruntime + CoreML 桥），收益群体小

3. **Windows DirectML / Linux**（v1+ 再考虑）
   - DirectML 覆盖 AMD/Intel/NVIDIA 全 GPU，但 prebuilt 不存在，工作量大
   - Linux 用户群在我们 v0.x 之前不是 P0

**关键工程项（v0.x 开 GPU 时绕不开）**：

- CI 矩阵增加：macOS-arm64-cpu / win-x64-cpu / **win-x64-cuda** 三套
- onnxruntime GPU dll 占 ~120 MB，必须按需下载（不要打进基础安装包）
- `numThreads` 在 GPU 模式下要强制设 1（CPU 多线程会和 GPU 抢资源，反而降速）

### 8.4 小结：用户问"GPU 呢？"该怎么答

- 默认模型场景，**CPU 已经够快**，没卡的用户体验不输有卡的
- 想要 GPU 加速的真实场景，是**用户主动选了大模型**（Whisper-large 等），这是 v0.x 的"专业模式"
- 实现路径明确（自编 + 按需下载），不是技术不可行，只是 v0.1 优先级不够

### 8.5 线程数与并发

- `numThreads`：onnxruntime 内部并行；SenseVoice 在 M1 上 `2` 最优、`4` 微涨、`8` 反而下降
- **多实例并发**：addon 是线程安全的（issue 跟踪显示 OK），可以同时跑 ASR + VAD + 标点；但**每个 Recognizer 实例独占一份权重**，内存占用线性
- **隔离到 worker_threads / 独立子进程**：长录音离线转录建议放 **utility process**（Electron 28+ 提供）或 child_process，避免阻塞主进程事件循环、也避免 OOM 时拖死整个 app

### 8.6 流式（v0.2 用得上）

- 离线 SenseVoice **不能改造成真流式**（非自回归 + 全句注意力）
- 真流式只能选 streaming Zipformer / streaming Paraformer，但**精度比 SenseVoice 离线低不少**
- v0.x 流式方案建议：**VAD 切片 + 小窗（2–5 s）跑 SenseVoice 离线**，伪流式但精度可控；社区里 SenseVoice 实时方案基本都是这个思路

### 8.7 内存

- SenseVoice int8 加载后驻留约 **600 MB–1 GB**（onnxruntime 的 arena allocator 偏激进）
- 长录音建议**用完显式销毁** Recognizer 实例，否则多个会话堆起来很可观
- 模型实例**可以复用**——一个 Recognizer 跑多条音频没问题

### 8.8 标点 / ITN

- SenseVoice 自带 `useItn`（数字归一化）和**自带标点**，无需再叠 CT-Transformer
- 但**自带标点偏保守**（很多场景标点稀疏），要追加 CT-Transformer 离线标点能改善——但代价是再加 38 MB 模型 + 二次推理
- v0.1 先用 SenseVoice 自带，效果不满意再叠

---

## 9. 模型分发策略：预装 vs 按需下载

模型体积是 LazyAudio 安装包大小的**主导项**——sherpa-onnx 运行时只占 25-30 MB，但 SenseVoice + VAD + 标点加起来 **~270 MB**，是运行时的 10 倍。怎么分发要在 v0.1 拍板。

### 9.1 三种方案对比

> **分发渠道前提**：v0.1 只通过 GitHub Releases 分发，不发 Mac App Store / Microsoft Store。这去掉了商店体积限制，但**核心约束（公证时间 + 整包更新 + 多模型场景）依旧成立**。

| 方案                      | 安装包大小 | 首启体验               | 国内         | 公证/CI 时间          | 模型更新            |
| ------------------------- | ---------- | ---------------------- | ------------ | --------------------- | ------------------- |
| A. 全预装                 | +270 MB    | 开箱即用               | 不受网络影响 | DMG 公证上传慢 2-3 倍 | 模型升级 = 整包更新 |
| B. **全按需下载（推荐）** | < 100 MB   | 首启需下载，1-3 min    | 必须配镜像   | 快                    | 模型独立升级        |
| C. 最小预装 + 按需        | +40 MB     | 基础能力开箱，主力按需 | 兜底可用     | 可控                  | 折中                |

### 9.2 选 B 的理由（GitHub-only 分发下依然成立）

1. **`electron-updater` 整包更新是真痛点**——`electron-updater` 走 GitHub Releases 时每次发版都全量重下，模型预装意味着用户每次升级都要重下 ~300 MB，劝退
2. **macOS 公证上传时间**——不发商店但还要公证（绕过 Gatekeeper），300 MB DMG 的公证上传明显比 50 MB 慢，CI 时间被拖长
3. **国内访问 GitHub Releases 本来就慢**——把模型也塞进去只会更慢；模型走**国内镜像**比 app 本身更关键
4. **多模型场景天然支持**——v0.1 默认 SenseVoice，但有人可能想换 Whisper / FireRedAsr，预装一个就是浪费另一个
5. **onboarding 流程天然有"配置时刻"**（product-spec §Onboarding 第 2 步：隐私模式选择）——本地模式 → 下载模型，用户预期清晰，不是"启动后莫名其妙等很久"
6. **app 卸载不删模型目录**（`~/Library/Application Support/LazyAudio/models/`）——重装能复用，已下载用户体验无损

代价：**首次启动必须联网**。这个 trade-off 比"安装包永远 300 MB + 每次更新 300 MB"划算，且通过文案设定预期可缓解。

### 9.3 实现要点

**目录结构**（与 product-spec §数据模型 对齐）：

```
~/Library/Application Support/LazyAudio/models/
├── manifest.json                            # 已下载模型清单 + 版本 + 校验码
├── sense-voice-zh-en-ja-ko-yue-int8-2025-09-09/
│   ├── model.int8.onnx
│   └── tokens.txt
├── silero-vad-v5/
│   └── silero_vad.onnx
└── ...
```

**模型注册表**（app 内置一份 JSON）：

```ts
{
  id: 'sense-voice-zh-en-ja-ko-yue-int8-2025-09-09',
  displayName: 'SenseVoice (中英日韩粤, int8)',
  type: 'asr-offline',
  sizeBytes: 234_000_000,
  files: [
    { path: 'model.int8.onnx', sha256: '...', size: 233_000_000 },
    { path: 'tokens.txt',      sha256: '...', size: 308_000 },
  ],
  sources: [
    'https://hf-mirror.com/k2-fsa/...',         // 国内镜像
    'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/...', // 官方
    'https://huggingface.co/k2-fsa/...',         // HuggingFace
  ],
  isDefault: true,
}
```

**下载源（按优先级 fallback）**：

1. 国内镜像：[hf-mirror.com](https://hf-mirror.com)（HuggingFace 镜像）或 ModelScope；最先尝试，国内用户拿这条
2. GitHub Releases（官方）：海外用户拿这条
3. HuggingFace 原站：终极兜底

实现上一个 HTTP 客户端，按列表顺序试，遇到超时/慢就切下一个。**不要让国内用户连 HuggingFace 卡 30s**——一开始就并发 head 请求测速然后选最快的也行。

**必备能力**：

- 断点续传（HTTP Range）
- **逐文件 SHA256 校验**——损坏率比想象中高，没校验等于裸奔
- 下载失败 / 暂停 / 取消 / 重试
- UI 显示总进度、单文件进度、网速、预计剩余时间
- 后台下载（用户可以关 onboarding 窗口去做别的，菜单栏继续下）

**模型管理（设置页）**：

- 列出已下载模型 + 占用空间
- 一键删除
- 切换默认模型
- 下载新模型（Whisper / FireRedAsr 等）

**版本与升级**：

- 模型 ID 内嵌日期（SenseVoice 已经从 `2024-07-17` 升到 `2025-09-09`）
- app 内置的 registry 每个版本里更新，启动时对比 manifest，提示用户升级（不强制）
- 旧版模型保留，用户可以回滚

### 9.4 GitHub Releases 的额外好处："含模型的大包" 当 asset 挂着

GitHub Releases 允许一个 release 挂多个 asset，且 public repo 下载带宽免费、单 asset 上限 2 GB——完全可以同一个版本同时挂：

```
LazyAudio-1.0.0-mac-arm64.dmg                  (<100 MB, 默认)
LazyAudio-1.0.0-mac-arm64-with-models.dmg      (~400 MB, 可选离线大包)
LazyAudio-1.0.0-mac-x64.dmg
LazyAudio-1.0.0-mac-x64-with-models.dmg
LazyAudio-1.0.0-win-x64.exe
LazyAudio-1.0.0-win-x64-with-models.exe
```

**关键点**：

- "含模型大包"只在 release 页**作为可选变体**给企业内网 / 保密场景 / 无网用户
- README 默认下载链接还是指**小包**——不要让大多数用户被多出来的 200+ MB 拖累
- `electron-updater` 永远从**小包链**升级——升级路径里不能混入大包，否则用户每次更新被迫拖 400 MB
- v0.1 可以先不做这个变体，v0.x 看反馈再加（CI 加一条 with-models build 即可）

### 9.5 决策汇总

- **方案 B**：v0.1 默认按需下载，主安装包 < 100 MB
- **分发渠道**：仅 GitHub Releases，配 `electron-updater` 走 GitHub provider 做应用自动更新
- **首启 onboarding**：隐私模式选"本地" → 模型选择页（默认 SenseVoice + 简短解释）→ 下载页（进度 / 重试 / 取消 / 断点续传）→ 完成
- **国内镜像必须做**——不只是"加分项"，国内访问 GitHub Releases 本来就慢，模型镜像（hf-mirror / ModelScope）是国内用户能不能跑通的关键
- **SHA256 校验**——非可选项
- **v0.x 可加**：模型管理设置页 + 多模型支持 + GitHub Release 挂"含模型大包"变体

---

## 10. 风险清单

| 风险                                                       | 影响  | 缓解                                                                                       |
| ---------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------ |
| macOS SIP 剥离 DYLD\_\*，生产包加载失败                    | 🔴 高 | §5.1 的 asarUnpack + @loader_path 方案；CI 必须做"签名+公证后启动"的 smoke test            |
| Windows ARM64（Surface 等）二进制包缺失                    | 🟡 中 | 检查 npm 上是否有 `sherpa-onnx-win32-arm64`；目前**只有 x64/ia32**，ARM64 用户走 emulation |
| 模型首启下载占带宽（234 MB）                               | 🟡 中 | 断点续传 + SHA256 校验 + 国内镜像（HuggingFace 国内访问不稳）                              |
| naudiodon2 在 macOS arm64 上编译失败                       | 🟡 中 | 不用它，自己写 ScreenCaptureKit 原生采集                                                   |
| Whisper 类大模型的内存 / 速度                              | 🟢 低 | v0.1 默认 SenseVoice 不踩这个雷                                                            |
| GPU 加速需要自己编 sherpa-onnx-node + onnxruntime GPU      | 🟡 中 | v0.1 不做；v0.x 仅做 win-x64-cuda 一条线（见 §8.3）                                        |
| 用户期待 GPU 加速但默认模型上感知不明显                    | 🟢 低 | 文案说清楚——GPU 模式是给大模型（Whisper-large 等）准备的，默认 SenseVoice 不需要           |
| Apache-2.0 license + 模型各自 license（SenseVoice 是 MIT） | 🟢 低 | 商业可用，发版前 about 页列出                                                              |

---

## 11. 给 LazyAudio v0.1 的行动建议

**必做**：

1. 主包 `sherpa-onnx` + 当前平台二进制包**全部声明为 `dependencies`**，CI 矩阵覆盖 macOS arm64 / macOS x64 / win32 x64
2. `electron-builder.json` 显式 `asarUnpack` sherpa 相关 `node_modules/**`
3. 主进程 `app.whenReady()` **之前**做：把 sherpa-onnx 的 dylib 目录加入 `process.env.DYLD_FALLBACK_LIBRARY_PATH`（dev）+ 验证生产包从 `app.asar.unpacked` 加载
4. ASR / VAD 跑在 **utility process**（Electron 28+）或 worker_threads，主进程只做 IPC 转发
5. **模型按需下载**（见 §9）：onboarding 选完隐私模式 → 模型选择 → 下载，必须有进度 / 取消 / 重试 / 断点续传 / SHA256 校验 / 国内镜像 fallback
6. 默认模型 = `sense-voice-zh-en-ja-ko-yue int8 2025-09-09`
7. 模型管理：app 卸载**不删** `~/Library/Application Support/LazyAudio/models/`（重装能复用）

**可做（v0.x 优化）**：

- **Windows + NVIDIA GPU 高性能模式**：自编 `sherpa-onnx-node` 启用 CUDA EP，按需下载 ~120 MB CUDA dll，对接 Whisper-large / FireRedAsr 等大模型场景（见 §8.3）
- 流式：VAD 切片 + 短窗 SenseVoice 实现伪流式
- 长录音切分：先 Silero VAD 分段、并行多 worker 跑 SenseVoice，最后按时间戳拼接（>30 min 录音收益明显）
- 标点二次精修：CT-Transformer 叠在 SenseVoice 输出上
- macOS CoreML EP（**优先级低**，对默认 SenseVoice int8 可能反而更慢；仅在用户主动选大模型时启用）
- Windows DirectML（v1+，工作量大、覆盖范围广但 prebuilt 不存在）

**不做（v0.1 别碰）**：

- 自己编 onnxruntime 启用 GPU
- 真流式 streaming Zipformer
- 说话人分离（pyannote）——分轨录制天然有 mic / system 两个 pseudo-speaker，够了
- WASM 版本（性能不够）

---

## 12. 参考链接

- 仓库与文档
  - [k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)（v1.13.2，Apache-2.0）
  - [Node.js addon examples README](https://github.com/k2-fsa/sherpa-onnx/blob/master/nodejs-addon-examples/README.md)
  - [sherpa-onnx docs](https://k2-fsa.github.io/sherpa/onnx/index.html)
  - [sherpa-onnx on npm](https://www.npmjs.com/package/sherpa-onnx)
- Electron 集成相关 issue
  - [#1945 — sherpa-onnx-node How to use it for electron](https://github.com/k2-fsa/sherpa-onnx/issues/1945)
  - [#2622 — Failed to load sherpa-onnx-node in Electron on macOS due to DYLD_LIBRARY_PATH issues (SIP)](https://github.com/k2-fsa/sherpa-onnx/issues/2622)
- 模型
  - [SenseVoice 文档](https://k2-fsa.github.io/sherpa/onnx/sense-voice/index.html)
  - [FunAudioLLM/SenseVoice 上游](https://github.com/FunAudioLLM/SenseVoice)
  - 模型下载：sherpa-onnx GitHub releases tag `asr-models`
- Electron 原生模块
  - [electron-builder asarUnpack](https://www.electron.build/configuration.html)
  - [Electron Forge auto-unpack-natives](https://www.electronforge.io/config/plugins/auto-unpack-natives)
- 音频采集替代
  - [decibri docs — sherpa-onnx VAD 集成](https://decibri.dev/docs/node/integrations/sherpa-onnx-vad.html)
- 模型对比参考
  - [SenseVoice vs Whisper benchmark (whispernotes)](https://whispernotes.app/blog/sensevoice-fastest-cjk-transcription)
  - [Offline ASR benchmark — VoicePing](https://voiceping.net/en/blog/research-offline-speech-transcription-benchmark/)
