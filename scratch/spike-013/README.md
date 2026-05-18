# spike-013 hypothesis → confirmed UI 稳定性 — POC 工作区

> 这里的代码只服务 spike-013 的决策,不是产品代码。
> hypothesis → confirmed 正式渲染在 T35,会**参考**本目录的 key 策略结论,不直接复用代码。

## 目标

回答:Pass A 的 hypothesis 在反复改写期间,React 列表能否保持 DOM 稳定(不 unmount → 不闪烁 → 阅读光标不跳行)。

spike-013 退出条件:**segment id 在 90% 以上 hypothesis 周期内不变**。

完整结论 + 数据写在 [`../../docs/01-research/tech-feasibility.md` §spike-013](../../docs/01-research/tech-feasibility.md)。

## 怎么跑

```bash
cd scratch/spike-013
pnpm install
pnpm dev    # vite 起 http://localhost:5173
```

打开浏览器 → 自动跑 21 帧 ASR mock 数据流 → 底部统计面板显示量化数字。

## 怎么对比

同一 ASR mock 数据流并排喂两个 panel,每个 panel 用不同的 React `key` 策略:

- **A. content-hash key**:`key = djb2(seg.text)`。文本一改 key 变 → React unmount + remount → DOM 重建。
- **B. timestamp-start key**:`key = seg.startMs`。VAD 切窗的起点稳定,后续 ASR 改写不影响 key → React 复用 DOM。

每个 `SegmentItem` 用 `useRef` + `useEffect` 计数自己 mount / unmount 次数,
panel 头部展示 "渲染 X / mount Y / unmount Z"。

## 目录

```
scratch/spike-013/
├── README.md         # 本文
├── package.json      # 独立 npm 项目,vite + react,不污染根
├── index.html
├── vite.config.ts
├── tsconfig.json
└── src/
    ├── main.tsx      # 故意关掉 StrictMode(避免 dev 双触发 effect 干扰数字)
    ├── App.tsx       # 两个 Panel 并排 + 底部聚合统计
    ├── asr-mock.ts   # 21 帧确定性 mock 脚本(4 个 segment,带 hypothesis 改写)
    └── style.css
```

## 测什么(避开什么)

**测**:React `key` 策略对 `SegmentItem` mount / unmount 的影响。统计 21 帧跑完后两策略的 unmount 总数 + segment id 稳定率。

**没测**:

- 真实 ASR engine 输出 — mock 是确定性脚本,production 数据频率 / 段长不同,但 key 稳定性是结构性结论。
- 视觉过渡 — DOM 复用后内容平滑切换 vs 不切换是 T35 加 200ms accent 时再验。
- 大列表性能 — segment 数 > 200 时虚拟列表(T39)的事,本 spike 不涉及。

## 已知坑

- **React 19 StrictMode 在 dev 双触发 effect**:每个 mount 会触发两次 setup/cleanup,unmount 计数被污染 → 量真实 mount/unmount 必须关 StrictMode。production 默认不开 StrictMode 跑(只 dev 开)。
- Pass A engine 输出契约:**必须**给 segment 暴露稳定 `startMs`,后续同段改写不变。如果换 engine 只给文本不给 startMs,要在 segment id allocator 层(renderer 或 main)分配本地稳定 id。
