# spike-005 mic / system 漂移量化 — POC 工作区

> 这里的代码只服务 spike-005 的决策，不是产品代码。
> 录音 / mixdown 正式实现在 M3（T12-T14），会**参考**但不直接复用本目录。

## 目标

回答："不做漂移补偿的情况下，mic 路和 system 路（loopback）的时间偏差有多大？"

退出条件（[`docs/01-research/tech-feasibility.md` §R5](../../docs/01-research/tech-feasibility.md)）：

- `|drift| p95 < 50 ms` → 不需对齐，直接 sum / 平均混音
- `50 ms ≤ |drift| p95 < 100 ms` → 警告 + M3 后期评估
- `|drift| p95 ≥ 100 ms` → 触发 Plan B 漂移补偿

完整结论 + 数据写在 [`../../docs/01-research/tech-feasibility.md` §spike-005](../../docs/01-research/tech-feasibility.md)。

## 方法

1. 主进程生成 `reference.wav`：12 秒长，含 6 个 click 脉冲（5ms 1kHz tone w/ Hann 窗），间隔 1.5s。
2. Renderer 同时 `getUserMedia(mic)` + `getDisplayMedia({ video, audio: 'loopback' })`，两路接同一 `AudioContext(48000)` 的 `AudioWorklet`，把每个 128-sample block 原样传回主线程串成 Float32 PCM。
3. 主进程 `spawn('afplay', reference.wav)`：默认扬声器播放 reference 信号。
   - **mic 路**：通过扬声器声学路径收到（speaker → 空气 → mic mic，~30 cm 距离 ≈ 0.9 ms 声学延迟，可忽略相对量级）。
   - **system 路**：ScreenCaptureKit loopback 收到的数字回环。
4. capture 12 秒，写 `results/mic-runN-*.wav` + `results/system-runN-*.wav` + `results/meta-runN-*.json`。
5. 一次 `bench` 跑 3 次 run（共 18 个 click 对）。
6. `pnpm analyze` 离线读 wav：在每个 click 的 expected 时刻 ±0.3s 窗口里找包络峰值 → 算 `mic.peakSec - sys.peakSec` → 输出 per-click / per-run / 整体统计 + 判定。

## 怎么跑

```bash
cd scratch/spike-005
pnpm install
pnpm bench       # 弹 Electron 窗，点"开始 3 次 run"，给 mic + Screen Recording 权限
pnpm analyze     # 读 results/ 出报告 + analysis-summary.json
```

首次跑：

- macOS 弹 **mic** 权限对话框 → Allow
- macOS 弹 **Screen Recording** 权限对话框（getDisplayMedia 拿系统 loopback 需要）→ Allow
  - 给完权限后通常要重启 Electron 进程
- 扬声器音量调到正常说话音量；外界尽量安静

## 目录

```
scratch/spike-005/
├── README.md           # 本文
├── package.json        # 独立 npm 项目
├── .gitignore          # node_modules / results / *.wav 不入库
└── src/
    ├── main.js         # Electron 主进程：build reference / spawn afplay / 写 wav
    ├── preload.js      # contextBridge
    ├── index.html      # renderer：两路 capture + 自动跑 3 次 run
    └── analyze.mjs     # 离线分析 CLI（Node only，无 Electron 依赖）
```

## 测什么 / 不测什么

**测**：单次 capture session 内，mic 和 system 两路在 AudioContext 时钟基准下，对同一物理事件（click 经扬声器播放）的接收时间差，连续 12 秒、6 个 click 跨度。

**不测**：

- 跨多次 capture session 的可重复性（每次 run 各自独立测一组 6 个 click）
- 不同硬件采样时钟的长时间累积漂移（12s 太短，体现不出 1 ppm 级 clock skew）— M3 长录音稳定性 spike-006 再覆盖
- 不同采样率组合（mic 与 system 都强制 48kHz）

## 已知偏差源

- speaker → mic 声学传播：30cm 距离 ≈ 0.9 ms，会让 mic 始终慢于 system。判定阈值（50 / 100 ms）远大于这个量级，不补偿。
- afplay 启动延迟：与对齐无关（我们对齐的是两路 capture 接收到 click 的相对时间）。
- Hann 包络的峰值检测精度：5ms 窗口内单点解析度 ~0.02 ms，远低于 50 ms 阈值。
