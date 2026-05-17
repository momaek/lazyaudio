# ADR-0003 ASR 跑在 Electron utility process

- **状态**:proposed(占位,T01 落地;完整理由 / 候选对比待补)
- **日期**:2026-05-17
- **相关**:[`../../03-architecture/overview.md`](../../03-architecture/overview.md) §2 / [`../../03-architecture/transcription-pipeline.md`](../../03-architecture/transcription-pipeline.md) §3

## 背景

sherpa-onnx 离线一次转录 1h 录音耗时数分钟、内存峰值数 GB;streaming Pass A 长时间常驻吃 CPU。如果跑在 main / renderer:

- main:阻塞 IPC,录音 tick / UI 全卡;OOM 会拖垮整个 app
- renderer:同样卡 UI,且和 React 渲染抢线程

Electron 28+ 提供 `utilityProcess` —— 独立进程、可 fork、支持 MessagePort、崩溃可单独重启,不影响主进程。

## 决策(一句话)

**v0.1 所有 ASR(Pass A streaming + Pass B offline)都跑在 Electron utility process;主进程通过 `utilityProcess.fork` + `parentPort` 调度,PCM 走 MessagePort 传输。**

## 候选与否决理由

待补。需要扩充:

- 候选 A:utility process(选)
- 候选 B:`child_process.fork`(无 MessagePort / 崩溃事件粗糙)
- 候选 C:`worker_threads`(同 process,OOM 一起死)
- 候选 D:renderer 内 WebWorker + WASM(sherpa-onnx-research §3 已否决,性能差 5×+)

## 后续影响

- `src/main/workers/asr/index.cts` CommonJS 入口(与 sherpa-onnx-node 兼容,详见 transcription-pipeline §3.2.1)
- `src/main/transcribe/utility-spawn.ts` 负责 fork / init / 重启策略
- utility 崩溃 → main 重启 3 次后标 failed(T37)
- 调试受限:utilityProcess.fork 不支持 `--inspect`(详见 dev-environment §7.3)
