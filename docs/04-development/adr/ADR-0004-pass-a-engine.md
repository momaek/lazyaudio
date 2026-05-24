# ADR-0004 Pass A 实时字幕引擎选 Silero VAD + SenseVoice 短窗伪流式

- **状态**:accepted
- **日期**:2026-05-17
- **驱动**:[`docs/01-research/tech-feasibility.md`](../../01-research/tech-feasibility.md) §spike-011
- **POC 工作区**:[`scratch/spike-011/`](../../../scratch/spike-011/)
- **相关**:[`docs/01-research/prd.md`](../../01-research/prd.md) §4.1 F4.6–F4.9 / §7.1 / [`docs/03-architecture/transcription-pipeline.md`](../../03-architecture/transcription-pipeline.md) §StreamingEngine / [`docs/01-research/sherpa-onnx-research.md`](../../01-research/sherpa-onnx-research.md) §6 / §8.6

## 背景

PRD §4.1 F4.6 给 v0.1 加了 Multi Pass:录音中实时显示 Pass A 字幕(hypothesis),录音停止后 Pass B 全文重跑。Pass B 已经确定走 SenseVoice int8 离线([ADR-0003](./ADR-0003-asr-in-utility-process.md) + sherpa-onnx-research §6.3),Pass A 引擎需要从两条路径里二选一,这是 M4 模型清单 / 内存预算 / utility 拓扑的关键输入。

两个候选:

- **A. streaming Zipformer**(`sherpa-onnx OnlineRecognizer`)— 真流式 transducer,chunk-by-chunk 解码,自带 endpointing
- **B. VAD 短窗 SenseVoice**(`Silero VAD` + `OfflineRecognizer`)— Silero VAD 切片,每段 2-5s 离线跑 SenseVoice,伪流式

## 决策(一句话)

**v0.1 Pass A 走 B 路:Silero VAD 切片 + SenseVoice 离线短窗,与 Pass B 复用同一份 SenseVoice 模型实例。**

## 候选与否决理由

### 候选 A:streaming Zipformer

**优势**:

- 真流式,理论上 hypothesis 滚动更连续
- 模型相对小(~190 MB int8)
- sherpa-onnx 官方 example 完整支持

**否决理由**:

- spike-011 实测中文 CER 平均 26.0%,**是 B 路(9.8%)的 2.66×**,远超 dev-plan 退出条件 < 1.2× 的阈值
- 在中英混编 / 字母拼读样本上 CER 飙到 57.9%(B 路 15.8%) — 与 sherpa-onnx-research §6.2 中"streaming Zipformer 中文 CER 低于 SenseVoice"的判断吻合
- 引入第二份独立模型 → Pass A 与 Pass B 同时持有时 rss 从 455 MB 涨到 785 MB,加重 PRD §7.1 2.5 GB 内存预算压力
- 与 Pass B 模型不一致 → 用户视觉上会感受到 Pass A → Pass B 替换时大幅文本改写(同一句话两种识别风格),损害"原地刷新"的体验目标

### 候选 B:Silero VAD + SenseVoice 短窗(选)

**优势**:

- spike-011 实测平均 CER 9.8%,且最差 fixture 也只有 15.8%
- **与 Pass B 复用同一份 SenseVoice 实例** — Pass A → Pass B 切换只是窗口大小变化(短窗 → 全文),不卸载也不重载模型;rss 不抖
- M4 默认下载模型清单从 ~270 MB 收缩到 SenseVoice 158 MB + Silero VAD 0.6 MB ≈ **159 MB**,首启网络更友好
- 段延迟 p95 56 ms,远低于 PRD §7.1 < 3s 目标;真实会议场景里 VAD 会更频繁触发 endpoint,段更短,体感"边说边出字"
- SenseVoice 在 M 系列 CPU 上 RTF 实测 0.016(预期 0.03-0.05),远超实时,短窗模式吞吐充裕

**已知劣势**:

- VAD 切片不是真流式,**用户感受到的最短粒度 = 一个 VAD segment 而不是 100 ms chunk** — 短句快速对话场景下 hypothesis 显示会有 0.5-2s 的"等下一句"感
- VAD 边界附近字可能切错(整段重识别会修正,但分段瞬态可能轻微跳)
- 长段(> 30s 不停顿)会把 SenseVoice 短窗变成"中窗",内存峰值上升 — 需要在 utility process 加 max-window-seconds 限制

### 候选 C(未实测,显式不选):streaming Paraformer

GH release 文件存在但 1 GB,体积超 M4 预算 5×,直接淘汰。

### 候选 D(未实测,显式不选):自训练 streaming 模型

超出 v0.1 范围;v0.x 看反馈再评估。

## 后续影响

### 文档回写

- ✅ [`docs/01-research/tech-feasibility.md`](../../01-research/tech-feasibility.md) §spike-011 添加完整结果章节
- ✅ [`docs/01-research/sherpa-onnx-research.md`](../../01-research/sherpa-onnx-research.md) §3 修正(`sherpa-onnx` 是 WASM 版,`sherpa-onnx-node` 才是 N-API addon)
- ✅ [`docs/04-development/development-plan.md`](../development-plan.md):spike-011 表格状态 → done
- 🔲 [`docs/03-architecture/transcription-pipeline.md`](../../03-architecture/transcription-pipeline.md) §StreamingEngine:把"streaming-zipformer-bilingual-zh-en"改为"vad-shortwin-sense-voice";delete §"local-streaming-zipformer" 候选条目
- 🔲 [`docs/01-research/prd.md`](../../01-research/prd.md) §7.1 内存上限:**保持 2.5 GB** — B 路实际下可能更低(共享 SenseVoice),但保留余量给 utility process 自身开销 + VAD 缓冲;不动 PRD

### M4 实现影响

- **T31 模型下载**:默认下载清单 = SenseVoice int8 + Silero VAD(原 sherpa-onnx-research §5.4 的 CT-Transformer 标点也确认不进 v0.1,SenseVoice 自带标点)
- **T32 / T34**:Pass A engine = `local-streaming-vad-shortwin`,Pass B engine = `local-sense-voice`,**两者共享 utility process 中的同一份 OfflineRecognizer 实例**
- **T36 Pass A → Pass B 切换**:不再是"unload + spawn",改为"切换 window 模式";降级路径 spike-012a 验证(M2 arm64;spike-012b 低配机复测 deferred-v0.x)
- **`native/models/registry.json`**:只列 SenseVoice + Silero VAD,不再有 streaming Zipformer 条目

### 架构影响

- `src/main/transcribe/streaming/local-streaming.ts` 改名为 `local-vad-shortwin.ts`(命名反映实际策略)
- `src/main/workers/asr/streaming.cts` 不需要单独的 streaming 模型加载逻辑,与 offline 共用 SenseVoice 加载
- segment id 设计(spike-013 输入):因为短窗 + 全文都是 SenseVoice 输出,replacement 时 token-level 对齐更可控

### 风险

- **小样本 caveat 已写在 tech-feasibility,spike-012a 必须用真实会议 ≥ 30 段复测;数据如反转则按 dev-plan §10.2 砍 Pass A**(spike-012b 多机型复测 deferred-v0.x)
- 长无停顿语段(如朗读 / 单口相声):VAD 触发频率低,短窗变长 → 可能短暂超过 200 MB 短期内存峰值。T34 加 max-window-seconds 兜底,超时强制切段
- B 路 Pass A 与 Pass B 视觉上仍会有"替换" — 用同一模型不会消除替换(因为 Pass B 看的是整句上下文,可能修正短窗误识)。spike-013 + 02-design 屏幕规范需要明确替换动效不刺眼。
