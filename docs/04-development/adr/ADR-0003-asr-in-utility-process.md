# ADR-0003 ASR 跑在 Electron utility process

- **状态**:accepted
- **日期**:2026-05-17
- **驱动**:[`docs/03-architecture/overview.md`](../../03-architecture/overview.md) §2 / [`docs/03-architecture/transcription-pipeline.md`](../../03-architecture/transcription-pipeline.md) §3 / [`docs/01-research/sherpa-onnx-research.md`](../../01-research/sherpa-onnx-research.md) §8.5
- **相关**:[`ADR-0002`](./ADR-0002-sherpa-onnx-loader-path.md)(同一 utility 内的 @loader_path 加载链)/ [`ADR-0004`](./ADR-0004-pass-a-engine.md)(Pass A / B 共享同一个 utility 实例)

## 背景

转录工作负载有两个特点:

1. **资源重**:
   - SenseVoice int8 模型加载后 rss ~455 MB(spike-011 实测,与 sherpa-onnx-research §8.7 估算 600MB-1GB 一致下界)
   - 离线全文转录 1h 录音耗时数十秒(M 系列 RTF 0.016 ~ 1min),CPU 跑满 2 线程
   - streaming Pass A 长时间常驻
2. **健壮性差**:模型加载 / dlopen / onnxruntime 内部异常都可能直接拖垮宿主进程;长录音内存增长有累积风险

如果跑在:

- **main 进程**:阻塞 IPC event loop → 录音 tick / UI 全卡;OOM 直接挂整个 app(包括录音状态机 → 用户数据丢失)
- **renderer 进程**:与 React 渲染抢线程 → UI 卡;`nodeIntegration` 关闭后没法直接 require addon,得开后门违反 security 模型
- **常规 child_process.fork**:有进程隔离,但 IPC 用 stdio JSON,**高吞吐 PCM 流(48k 16-bit ≈ 1.5 MB/s)序列化代价高**;没有 MessagePort transferable

Electron 28+ 提供 `utilityProcess` —— 独立进程 + Chromium 服务模式 + MessagePort 支持 + 进程崩溃事件粒度细。这是为 native addon 长任务量身设计的入口。

## 决策(一句话)

**v0.1 所有 ASR(Pass A streaming + Pass B offline + 未来 cloud transcribe 也走同样路径)跑在 Electron utility process;主进程通过 `utilityProcess.fork` + `parentPort` 调度,PCM 走 `MessagePortMain` 零拷贝传输,模型加载 / 推理 / 段落 emit 都在 utility 内完成。**

## 候选与否决理由

### 候选 A:Electron utility process — ✅ 选

- 独立进程:OOM / 崩溃只杀 utility,主进程录音状态机不受影响
- 原生支持 `MessagePort`:零拷贝 ArrayBuffer 传 PCM,比 child_process JSON 序列化快
- 主进程能拿到细粒度生命周期事件(`spawn` / `exit` / `error` 各自有 callback)
- Electron 28+ 已稳定(我们目标 Electron 35+,远超此版本)
- Chromium 进程模型 + 沙箱权限可控
- sherpa-onnx-research §8.5 明确推荐这个路径

**代价**:

- 需要单独的 CommonJS 入口(`.cts` → `.cjs`,与 sherpa-onnx-node CJS 兼容)
- 调试受限:utilityProcess 不接 Node 的 `--inspect`(详见 dev-environment §7.3),用 `stdio: 'inherit'` + `parentPort` 转发日志兜底

### 候选 B:`child_process.fork`

- 进程隔离同样能拿到
- 支持 `--inspect` 调试
- API 更熟

**否决理由**:

- **没有 MessagePort transferable**:PCM 高吞吐场景必须 JSON 序列化或自己写二进制协议,代码复杂度上升
- 崩溃事件粗糙(只能监听 `exit` code,没有 `error` 与 `spawn` 分开的钩子)
- 与 Electron 的进程沙箱体系不一致(不走 Chromium service)— 在 macOS 上 .node 加载受到的 SIP 限制更严
- v0.x 真要切回来不是大改,但 v0.1 没理由不用 utilityProcess

### 候选 C:`worker_threads`

- 同进程内多线程,IPC 走 `MessagePort`,共享 ArrayBuffer
- 启动快(没有进程 fork 开销)

**否决理由**:

- **OOM 直接拖死主进程** — sherpa-onnx 加载重型模型时的内存 spike 可能触发主进程 OOM 杀手
- 共享 V8 实例 + libuv:模型 dlopen 出问题(参考 ADR-0002 描述的 dyld 异常)直接挂主进程
- Node addon 的多线程兼容性参差:sherpa-onnx N-API 是 6+ ABI 稳定的,但跑在 worker_threads 里仍有 thread-local storage 边界问题
- 调试不比 utilityProcess 强多少
- 这是"看起来轻量但实际把所有风险共担"的方案,不议

### 候选 D:renderer + WebWorker + WASM

- 没有打包坑(WASM 文件直接打进 asar)
- 与 React 同进程,理论上 UI 响应快

**否决理由**:

- WASM 性能比 N-API 慢 5×+(sherpa-onnx-research §3 已结论否决)
- 单线程 WASM 跑不动 SenseVoice 大模型(同上)
- renderer `nodeIntegration: false`,native addon 无法加载
- 直接 pass

## 后续影响

### 代码

- `src/main/workers/asr/`(详见 [`project-structure.md`](../project-structure.md) §3):
  - `index.cts` — CommonJS 入口,`require('sherpa-onnx-node')`,处理 `parentPort` init message
  - `streaming.cts` — Pass A 短窗 SenseVoice 处理循环(ADR-0004)
  - `offline.cts` — Pass B 全文 SenseVoice 处理(同一份 OfflineRecognizer 实例)
  - `shared/platform-dir.cts` — 解析当前平台 `sherpa-onnx-darwin-arm64` etc 子包路径
  - `shared/log.cts` — `parentPort.postMessage({type:'log',...})` 转发到主进程 logger
- `src/main/transcribe/utility-spawn.ts`:
  - `utilityProcess.fork(entryPath, [], { serviceName: 'lazyaudio-asr', stdio: 'inherit' /* dev */ })`
  - 等待 init 完成 message 再认为 ready
  - 主进程持有 `MessagePortMain` 用于 PCM 流;另起 `parentPort` 通道用于事件(progress / partial result / error)
- `src/main/transcribe/orchestrator.ts`:
  - 录音 start → fork Pass A utility,push PCM
  - 录音 stop → 等 Pass A 收尾 → 切到 offline 模式(同一进程,见 ADR-0004 § "Pass A → Pass B 切换不需要 unload + reload")

### 打包

- electron.vite.config.ts 的 `main.build.rollupOptions.input` 必须加 utility 入口:
  ```ts
  'workers/asr/index': resolve('src/main/workers/asr/index.cts'),
  ```
- 产物 `out/main/workers/asr/index.cjs` 与主进程产物同一目录树
- ADR-0002 的 `asarUnpack` 必须包含 utility 入口路径(实际 sherpa-onnx-node 包已经被 unpack,这条不需额外配)

### 重启与失败处理

- utility 崩溃(`exit code !== 0`)→ orchestrator 重启,**最多 3 次**(详见 transcription-pipeline §3.6 / T37 实现)
- 3 次仍崩 → meta.transcribe.status = `failed`,UI 显示红色 ! + "重试" 按钮(T37)
- utility init 超时(默认 10s)→ 同上失败处理
- 长录音内存监控:每 30s sample `process.memoryUsage().rss`(在 utility 内通过 parentPort 上报),> 2.5 GB(PRD §7.1 上限)→ 主进程提示用户降级

### 调试

- dev 模式 utility 的 stdout 用 `stdio: 'inherit'` 直接进 electron 终端
- 不能 `--inspect`(`utilityProcess.fork` 的 `ForkOptions` 没有 `execArgv`,详见 dev-environment §7.3)
- 真要断点调试 → 临时把 utility 入口换成 `child_process.fork`(可 inspect) 跑一次 repro,修完切回。**不要为了能 inspect 把生产路径改成 child_process** — 丢掉 MessagePort 零拷贝 + 崩溃事件粒度,得不偿失

### 性能

- 当前 spike-011 实测:SenseVoice 加载 ~455 MB,RTF 0.016,utility 内 numThreads = 2 已最优(sherpa-onnx-research §8.5)
- spike-012a 在 M2 arm64 验证 utility 隔离的开销 ≤ 10% — 数据回来后回写本 ADR(spike-012b 在 Intel / Win i5 三档复测 deferred-v0.x,挂 M6 dogfood / 公开测试期反馈触发)

## 风险与回退

- **风险 1**:Electron 35+ utilityProcess 在 macOS 上的沙箱配置可能与 sherpa-onnx-node 的 dlopen 冲突 — spike-003 验证过单独的 dlopen,但在 utility 内还需 T30 重测
  - 缓解:T30 PR 第一次 land 前必须 packaged + 公证后 smoke test
- **风险 2**:utility 进程崩溃事件在某些 macOS 版本下延迟 / 丢失 — 上游 issue 偶有报告
  - 缓解:除了监听 `exit` 事件,主进程同时跑心跳 ping(每 5s,3 次无响应判崩)兜底
- **回退路径**:如果生产中发现 utilityProcess 不稳,可切回 `child_process.fork` + 自己实现二进制 PCM 协议(候选 B)。改动局限在 `src/main/transcribe/utility-spawn.ts`,工作量 ≈ 1 个 PR

## 与其它 ADR 的关系

- [ADR-0002](./ADR-0002-sherpa-onnx-loader-path.md):utility 里 `require('sherpa-onnx-node')` 时,@loader_path 改写后的 dylib 必须能被 dyld 找到 — 两个 ADR 互相支撑
- [ADR-0004](./ADR-0004-pass-a-engine.md):Pass A 与 Pass B 共享同一个 utility 实例 + 同一个 OfflineRecognizer,本 ADR 的进程隔离粒度刚好匹配"单 utility 一份模型"
