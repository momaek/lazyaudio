// 模拟 ASR 引擎流式输出。
// 每个 Segment 由 VAD 切窗产生,startMs 在切窗一刻就稳定;text 在 hypothesis 阶段可改写,
// confirmed 后定稿(stability 字段)。
// 第 K 段在它"还在进行"时,text 每个 tick 都可能改写(末尾追加 / 中间修正),典型场景。

export type Segment = {
  startMs: number
  text: string
  stability: 'hypothesis' | 'confirmed'
}

// 一条模拟会议脚本,按时间推进逐步揭露。
// 每个 frame 是"在 t 时刻 ASR 已经吐出的全部 segments"。
// 前几个 segment 会先以 hypothesis 形态出现 + 改写一两次,然后被定稿(confirmed);
// 最后一段(最新)持续 hypothesis 不停改写。
export const frames: Segment[][] = [
  // t=0
  [{ startMs: 0, text: '今', stability: 'hypothesis' }],
  // t=1
  [{ startMs: 0, text: '今天', stability: 'hypothesis' }],
  // t=2 - 改写(VAD 重新解析)
  [{ startMs: 0, text: '今天我们', stability: 'hypothesis' }],
  // t=3
  [{ startMs: 0, text: '今天我们讨论', stability: 'hypothesis' }],
  // t=4 - 第一段定稿,开第二段
  [
    { startMs: 0, text: '今天我们讨论一下', stability: 'confirmed' },
    { startMs: 2000, text: '产', stability: 'hypothesis' },
  ],
  // t=5
  [
    { startMs: 0, text: '今天我们讨论一下', stability: 'confirmed' },
    { startMs: 2000, text: '产品', stability: 'hypothesis' },
  ],
  // t=6 - 第二段被改写(从"产品"改成"项目")
  [
    { startMs: 0, text: '今天我们讨论一下', stability: 'confirmed' },
    { startMs: 2000, text: '项目', stability: 'hypothesis' },
  ],
  // t=7
  [
    { startMs: 0, text: '今天我们讨论一下', stability: 'confirmed' },
    { startMs: 2000, text: '项目的进展', stability: 'hypothesis' },
  ],
  // t=8 - 第二段定稿,开第三段
  [
    { startMs: 0, text: '今天我们讨论一下', stability: 'confirmed' },
    { startMs: 2000, text: '项目的进展', stability: 'confirmed' },
    { startMs: 4000, text: '首', stability: 'hypothesis' },
  ],
  // t=9
  [
    { startMs: 0, text: '今天我们讨论一下', stability: 'confirmed' },
    { startMs: 2000, text: '项目的进展', stability: 'confirmed' },
    { startMs: 4000, text: '首先', stability: 'hypothesis' },
  ],
  // t=10
  [
    { startMs: 0, text: '今天我们讨论一下', stability: 'confirmed' },
    { startMs: 2000, text: '项目的进展', stability: 'confirmed' },
    { startMs: 4000, text: '首先看一下', stability: 'hypothesis' },
  ],
  // t=11
  [
    { startMs: 0, text: '今天我们讨论一下', stability: 'confirmed' },
    { startMs: 2000, text: '项目的进展', stability: 'confirmed' },
    { startMs: 4000, text: '首先看一下数据', stability: 'hypothesis' },
  ],
  // t=12 - 第三段被改写一次("数据"改"指标")
  [
    { startMs: 0, text: '今天我们讨论一下', stability: 'confirmed' },
    { startMs: 2000, text: '项目的进展', stability: 'confirmed' },
    { startMs: 4000, text: '首先看一下指标', stability: 'hypothesis' },
  ],
  // t=13
  [
    { startMs: 0, text: '今天我们讨论一下', stability: 'confirmed' },
    { startMs: 2000, text: '项目的进展', stability: 'confirmed' },
    { startMs: 4000, text: '首先看一下指标', stability: 'confirmed' },
    { startMs: 6000, text: '上', stability: 'hypothesis' },
  ],
  // t=14
  [
    { startMs: 0, text: '今天我们讨论一下', stability: 'confirmed' },
    { startMs: 2000, text: '项目的进展', stability: 'confirmed' },
    { startMs: 4000, text: '首先看一下指标', stability: 'confirmed' },
    { startMs: 6000, text: '上周', stability: 'hypothesis' },
  ],
  // t=15
  [
    { startMs: 0, text: '今天我们讨论一下', stability: 'confirmed' },
    { startMs: 2000, text: '项目的进展', stability: 'confirmed' },
    { startMs: 4000, text: '首先看一下指标', stability: 'confirmed' },
    { startMs: 6000, text: '上周的', stability: 'hypothesis' },
  ],
  // t=16
  [
    { startMs: 0, text: '今天我们讨论一下', stability: 'confirmed' },
    { startMs: 2000, text: '项目的进展', stability: 'confirmed' },
    { startMs: 4000, text: '首先看一下指标', stability: 'confirmed' },
    { startMs: 6000, text: '上周的留存', stability: 'hypothesis' },
  ],
  // t=17
  [
    { startMs: 0, text: '今天我们讨论一下', stability: 'confirmed' },
    { startMs: 2000, text: '项目的进展', stability: 'confirmed' },
    { startMs: 4000, text: '首先看一下指标', stability: 'confirmed' },
    { startMs: 6000, text: '上周的留存数据', stability: 'hypothesis' },
  ],
  // t=18 — 末段改写
  [
    { startMs: 0, text: '今天我们讨论一下', stability: 'confirmed' },
    { startMs: 2000, text: '项目的进展', stability: 'confirmed' },
    { startMs: 4000, text: '首先看一下指标', stability: 'confirmed' },
    { startMs: 6000, text: '上周的留存率', stability: 'hypothesis' },
  ],
  // t=19
  [
    { startMs: 0, text: '今天我们讨论一下', stability: 'confirmed' },
    { startMs: 2000, text: '项目的进展', stability: 'confirmed' },
    { startMs: 4000, text: '首先看一下指标', stability: 'confirmed' },
    { startMs: 6000, text: '上周的留存率提升了', stability: 'hypothesis' },
  ],
  // t=20 — 末段定稿
  [
    { startMs: 0, text: '今天我们讨论一下', stability: 'confirmed' },
    { startMs: 2000, text: '项目的进展', stability: 'confirmed' },
    { startMs: 4000, text: '首先看一下指标', stability: 'confirmed' },
    { startMs: 6000, text: '上周的留存率提升了百分之十二', stability: 'confirmed' },
  ],
]

export const TICK_MS = 250
