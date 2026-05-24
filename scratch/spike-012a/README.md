# spike-012a — Pass A + 录音并发 1h 资源压测 (M2 arm64 本地)

> dev-plan §2.1 spike-012a 的 POC 工作区。M3 准入硬门槛。spike-012b
> (Intel Mac + Win i5 复测) 已 deferred-v0.x,本目录不做。

## 目标

在 M2 arm64 上跑 1h 双轨录音 (mic + system audio-only loopback) 与 Pass A
engine (silero-vad + sense-voice int8 短窗伪流式) 并发,量 PRD §7.1 的 5 个
预算指标:

- 内存 RSS p95 < 2.5 GB
- 主进程 CPU 1h mean < 8%
- utility CPU 1h mean < 150%
- Pass A RTF p95 < 0.1
- 实时字幕延迟 p95 < 3s

外加 leak check:第 1-10 min 平均 RSS vs 第 51-60 min 平均 RSS 偏移 < 5%。

## 架构

```
[Renderer (BrowserWindow)]
  - getUserMedia({audio:true})              -> mic 16k mono
  - getDisplayMedia({video:false,audio:true}) -> system loopback
  - AudioContext(sampleRate:16000) 自动 resample
  - 双 AudioWorklet "tap" -> 100ms chunks Float32
  - MessagePort -> main: { src:'mic'|'sys', pcm, frames }

[Main (Electron main)]
  - setDisplayMediaRequestHandler -> callback({audio:'loopback'})
    (audio-only SCKit 路径,按 spike-005 决策;不传 useSystemPicker:true)
  - 双 stream WAV append (mic.wav / system.wav)
  - mixed = mic + sys (clip) -> postMessage utility
  - monitor: 每 5s 采样 process.memoryUsage + app.getAppMetrics
    -> monitor.jsonl (per-process rss + cpu)
  - 收 utility 'pass-a:segment' 事件 -> segments.jsonl

[Utility (utilityProcess.fork)]
  - sherpa-onnx-node:
    - Vad (silero-vad, windowSize:512, threshold:0.5, minSpeech:0.25,
           minSilence:0.5, sampleRate:16000)
    - OfflineRecognizer (sense-voice int8, language:'zh',
                         useInverseTextNormalization:1, numThreads:2)
  - 缓冲 mixed PCM 16k mono Float32
  - 按 windowSize 喂 VAD;触发 endpoint -> 取 segment -> sense-voice 推理
  - 测 vadToAsrLatencyMs (endpoint 时刻 -> ASR done) + asrLatencyMs (推理时间)
  - postMessage main: { type:'pass-a:segment', segmentId, startMs, endMs,
                        text, asrLatencyMs, vadToAsrLatencyMs }
```

## 跑法

```bash
# 装 deps (Node 22+ 必需:nvm use 22)
pnpm install

# 下模型 (sense-voice ~158 MB + silero-vad ~2 MB) -> scratch/spike-012a/models/
pnpm models

# 5min smoke 测试 (验骨架就位 + 数据格式 OK)
pnpm smoke
# -> results/smoke-<timestamp>/{mic.wav, system.wav, monitor.jsonl,
#                               segments.jsonl, meta.json}

# 1h 压测 (注意:会占主输出设备 system loopback 1h)
pnpm bench
# -> results/1h-<timestamp>/...

# 分析数据
pnpm analyze results/1h-<timestamp>
# -> 出 p50/p95/mean for: rss, mainCpu, utilityCpu, asrLatency,
#                          vadToAsrLatency, segmentRtf
# -> leak check: 1-10min mean vs 51-60min mean
# -> 对照 PRD §7.1 预算逐条 pass/fail
```

## AC 对照 (progress.md §1)

| AC   | 内容                                    | 验证方法                                              |
| ---- | --------------------------------------- | ----------------------------------------------------- |
| AC1  | POC 骨架就位 (Electron + utility + ASR) | `pnpm smoke` 起得来,无 crash                          |
| AC2  | 5min smoke: ≥5 段 segment + ≥60 监控行  | `pnpm analyze results/smoke-*` 输出                   |
| AC3  | 1h 不挂                                 | `pnpm bench` 全程,monitor.jsonl ≥ 720 行              |
| AC4  | RSS p95 < 2.5 GB                        | analyze 输出                                          |
| AC5  | RSS leak < 5% (1-10min vs 51-60min)     | analyze 输出                                          |
| AC6  | 主进程 CPU mean < 8%                    | analyze 输出 (app.getAppMetrics 取 'Browser' process) |
| AC7  | utility CPU mean < 150%                 | analyze 输出 (取 'Utility' process)                   |
| AC8  | Pass A RTF p95 < 0.1                    | analyze 输出 (asrLatencyMs / segDurationMs)           |
| AC9  | 实时字幕延迟 p95 < 3s                   | analyze 输出 (vadToAsrLatencyMs)                      |
| AC10 | tech-feasibility §spike-012a 章节写完   | 数据回来后落笔                                        |

## 不在 scope

- 不验 mixdown 完整性 (T14 的事)
- 不验 segment id 稳定性 (spike-013 已 done)
- 不验 Pass A → Pass B 切换 (T36 的事)
- Intel Mac / Win i5 数据 → spike-012b deferred-v0.x

## 已知限制 (写在前面)

- mic 输入需手动给权限 (macOS 系统设置 → 隐私 → 麦克风 → Electron)
- system loopback 需 audio-only SCKit 权限 (macOS 14.4+;
  系统设置 → 隐私 → System Audio Recording Only → Electron)
- Electron.app 必须 ad-hoc 签 (`codesign --force --deep --sign -
node_modules/electron/dist/Electron.app`),否则 macOS 26 Tahoe TCC 静默拒绝
- 跑期间不要把电脑切到静音 / 拔耳机 (会扰动 system loopback,影响 VAD endpoint)
- 1h 跑测期间最好让电脑放点东西出声 (音乐 / 视频),让 VAD 有 endpoint 触发
  (静音 1h 跑出来 segments.jsonl 会近乎空,无法验 AC8/AC9)
