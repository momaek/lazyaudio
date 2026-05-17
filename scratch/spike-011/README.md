# spike-011 Pass A 引擎选型 — POC 工作区

> 这里的代码只服务 spike-011 的决策,不是产品代码。
> Pass A 正式实现在 T34(`src/main/transcribe/streaming/`),会**参考**但不直接复用本目录。

## 目标

在两条 Pass A 路径里二选一:

- **A. streaming Zipformer**(`sherpa-onnx OnlineRecognizer`)— 真流式,hypothesis 滚动可改写
- **B. VAD 短窗 SenseVoice**(`Silero VAD` + `OfflineRecognizer` × 2-5s 窗) — 伪流式,每段定稿

退出条件(对应 [`docs/01-research/tech-feasibility.md`](../../docs/01-research/tech-feasibility.md) §spike-011 决策表):
**A 路与 SenseVoice 离线全文 CER 差距 < 20% → 选 A;否则选 B。**

## 目录

```
scratch/spike-011/
├── README.md                  # 本文
├── methodology.md             # 详细方法学(同步在 tech-feasibility §spike-011)
├── package.json               # 独立的 npm 项目,不污染根
├── models/                    # 下载的 sherpa-onnx 模型(.gitignore)
│   ├── streaming-zipformer/
│   ├── sense-voice/
│   └── silero-vad/
├── fixtures/                  # 测试音频 + 参考文本(.gitignore)
│   └── *.wav, *.txt
├── results/                   # benchmark 输出(.gitignore)
│   └── *.json, *.csv
└── src/
    ├── poc-a-streaming.ts     # A 路 POC
    ├── poc-b-vad-shortwin.ts  # B 路 POC
    ├── lib/
    │   ├── wav.ts             # WAV 读写
    │   ├── cer.ts             # 中文 CER 计算
    │   └── metrics.ts         # 延迟 / 内存 / 易变性测量
    └── bench.ts               # 跑全套 benchmark + 输出 JSON
```

## 怎么跑

```bash
cd scratch/spike-011
pnpm install                       # 装 sherpa-onnx
pnpm download:models               # 下三个模型(~400MB)
pnpm prepare:fixtures              # 从 SenseVoice tarball 抽 test_wavs + ref text
pnpm tsx src/bench.ts              # 一键跑两路 + 输出 results/
```

## 产出物归宿

- 数据:`results/*.json` + `methodology.md` 的「测量结果」节,**复制摘要进 tech-feasibility §spike-011**
- 决策:[`docs/04-development/adr/ADR-0004-pass-a-engine.md`](../../docs/04-development/adr/ADR-0004-pass-a-engine.md) 完整版

## 限制声明

- 单点跑分(本机 Apple Silicon),不代表 Intel Mac / Windows
- Fixture sample size 小(SenseVoice tarball 自带 ~3-5 中文样本)— 量化趋势 OK,绝对数据不严谨
- spike-012 会在 M1 / Intel / Win i5 三档复测同一份模型 + 真实长录音
