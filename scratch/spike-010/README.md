# spike-010 快捷键 → 第一帧 PCM 时延量化 — POC 工作区

> 这里的代码只服务 spike-010 的决策,不是产品代码。
> 浮窗 / 快捷键 / 录音正式实现在 M3(T10-T12),会**参考**但不直接复用本目录。

## 目标

回答:"快捷键 → 浮窗显示 → 第一帧 PCM"是否能压在 PRD §7.1 的 **< 500ms** 总预算内,
配套 dev-plan T11 的子预算 **浮窗 < 100ms + 第一帧 PCM < 400ms**。

完整结论 + 数据写在 [`../../docs/01-research/tech-feasibility.md` §spike-010](../../docs/01-research/tech-feasibility.md)。

## 怎么跑

```bash
cd scratch/spike-010
pnpm install
pnpm bench
```

bench 启动后:

1. 主进程预创建一个隐藏 prep window,500ms 后 IPC 触发 renderer 跑 bench。
2. Renderer 顺序跑:**A 段 show 延迟(15 轮 + warmup)** → 触发 mic 权限 → **B 段 PCM 第一帧延迟(10 轮 + warmup)**。
3. 主进程聚合 + 写 `results/bench-<timestamp>.json` + 退出。

首次跑会弹 macOS mic 权限对话框,点 Allow 后 bench 才能跑 B 段。如果点 Don't Allow,
后面 `getUserMedia` 会以 `NotFoundError: Requested device not found` 报错,B 段跳过,A 段照常拿数据。

## 目录

```
scratch/spike-010/
├── README.md         # 本文
├── package.json      # 独立的 npm 项目,装 electron(不污染根)
├── results/          # bench 输出(.gitignore)
└── src/
    ├── main.js       # 主进程:预创建 prep window + A 段 show bench + 聚合 + 写 results
    ├── preload.js    # contextBridge 暴露 spike.{runShowBench, reportPcm, allDone, onStartBench}
    └── index.html    # renderer:接 main IPC 触发 → A 段 → mic 权限 → B 段
```

## 测什么(避开什么)

**A 段(主进程时钟)**:`win.show()` 调用前 `process.hrtime` 到 `'show'` event 触发的耗时。

- 量的是 NSWindow hidden→visible 的 OS 切换,不是用户视觉感知(差一帧 compositor)。
- 模拟 production T11:浮窗常驻 hidden,快捷键来才 show。

**B 段(renderer 时钟)**:按钮触发 → `getUserMedia` → `AudioContext` + `AudioWorklet` → 收到第一帧非空 PCM。

- 包含设备授权 cached path 的延迟,不包含首次权限对话框时间。
- 每轮完整 close 上一轮 stream + ctx,模拟最差"按一次录一次"。

**没量到**:

- `globalShortcut` 触发延迟(OS 调度,通常 <10ms 可忽略)。
- compositor 合成一帧的时间(~16ms @ 60Hz,固定开销)。
- macOS mic 权限对话框出现到用户点击的时间(不可控)。

## 已知坑

- **Electron 33 在 hide→show 同 tick race 下 `'show'` event 不 fire**。修复办法:`hide()` 后 `await 'hide' event`,再等 250ms,再 `show()` + 等 `'show'` event。
- **Hidden window 里 renderer 的 `setTimeout` 可能被 Chromium throttle 到 1Hz**。修复办法:main 端 `ready-to-show` 后通过 IPC `start-bench` 主动触发 renderer 开跑。
- 若用户拒绝 mic 权限,getUserMedia 报 `NotFoundError`(不是 `NotAllowedError`)— Chromium 行为。
