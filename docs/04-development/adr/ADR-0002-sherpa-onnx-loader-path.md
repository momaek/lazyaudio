# ADR-0002 sherpa-onnx 在 macOS 的 @loader_path 加载链

- **状态**:accepted
- **日期**:2026-05-17
- **驱动**:[`docs/01-research/sherpa-onnx-research.md`](../../01-research/sherpa-onnx-research.md) §5.1-§5.4 / [`docs/01-research/tech-feasibility.md`](../../01-research/tech-feasibility.md) §R3 §R4
- **相关**:[`docs/03-architecture/transcription-pipeline.md`](../../03-architecture/transcription-pipeline.md) §3.2 / [`docs/04-development/build-and-release.md`](../build-and-release.md) afterPack hook

## 背景

`sherpa-onnx-node`(N-API addon,详见 [ADR-0004](./ADR-0004-pass-a-engine.md) §回灌 + sherpa-onnx-research §3 修订)在 macOS 上由一组组件构成:

```
node_modules/sherpa-onnx-darwin-arm64/
├── sherpa-onnx.node             # N-API addon(主入口)
├── libsherpa-onnx-c-api.dylib   # C API 包装
├── libsherpa-onnx-cxx-api.dylib # C++ API 包装
├── libonnxruntime.dylib         # onnxruntime symlink
└── libonnxruntime.1.24.4.dylib  # onnxruntime 真实文件
```

npm prebuilt 里的每个 `.dylib` 的 `install_name`(otool -D 查得)是**构建机的绝对路径**(类似 `/private/tmp/.../libonnxruntime.dylib`),指向构建主机的 `node_modules`。

dev 模式下 `DYLD_FALLBACK_LIBRARY_PATH` 还能兜底加载,但 **packaged + 公证后的 .app**:

- macOS SIP 启动签名后的 Helper 进程时**剥离所有 `DYLD_*`** 环境变量(系统完整性保护机制,与 Apple Silicon 强相关)
- dyld 按绝对路径找,目标在用户机上不存在 → `dyld: Library not loaded: ... no such file`
- ASR 一启动就崩(spike-003 在 dev 通过 + spike-004 在 packaged 时复现过)

社区跟踪:[sherpa-onnx #2622](https://github.com/k2-fsa/sherpa-onnx/issues/2622)、[#1945](https://github.com/k2-fsa/sherpa-onnx/issues/1945)。

## 决策(一句话)

**electron-builder 的 afterPack hook 用 `install_name_tool` 把所有 sherpa-onnx 相关 `.dylib` 的 install_name 改写为 `@loader_path/<basename>`,然后用 hardened-runtime + 必要 entitlements 重签;运行时 dyld 按 `.node` 同目录解析 `.dylib`,SIP 剥不掉。**

## 候选与否决理由

### 候选 A:`@loader_path` 改写 + afterPack 重签 — ✅ 选

- 改写完成后**与 SIP 无关**:dyld 不需要环境变量,按二进制内置 rpath 解析
- 上游 sherpa-onnx 文档 [#2622](https://github.com/k2-fsa/sherpa-onnx/issues/2622) 明确推荐这条
- electron-builder afterPack 已是 native addon 重签的标准做法(参考其它 native 依赖的 Electron 项目)
- 一次性脚本,后续 sherpa-onnx 升级版本不需要改流程,只要 `.dylib` 名字对得上 glob 即可

**代价**:打包链增加 `scripts/after-pack.cjs` 一个文件 + electron-builder afterPack 配置;每次 build 多 ~10s。

### 候选 B:运行时设 `DYLD_FALLBACK_LIBRARY_PATH`(在 `app.whenReady()` 之前)

- 实现成本最低,主进程入口加几行 `process.env.DYLD_FALLBACK_LIBRARY_PATH = ...`
- dev 模式确实有效

**否决理由**:

- **生产签名包无效**:SIP 在加载 Helper 时已经剥光 `DYLD_*`,主进程后续才执行 — 主进程改的环境变量传不到已经在加载的 Helper
- sherpa-onnx #2622 已明确"对应用层最简单的做法不是改环境变量,而是 @loader_path 改写"
- 即使能临时让 dev 跑起来,会掩盖问题 — CI 不跑签名包 smoke test 的话发版前才发现就晚了

### 候选 C:把 dylib 链接成 Framework 放进 `.app/Contents/Frameworks/`

- macOS 标准的"嵌套二进制"分发方式
- 签名工具友好,公证天然走通

**否决理由**:

- 与上游 sherpa-onnx 的发布形态脱节,每次升级 npm 包都要重新打 framework
- 需要自己维护 `Info.plist` / framework 结构 / 版本号
- 跨平台不一致(Windows 不需要 framework),增加平台代码差异
- 收益不明显 — 候选 A 已经够稳定

### 候选 D:不解决,接受 SIP 剥离 → 仅在 dev 模式可用

**否决理由**:产品需求(PRD §3.1 本地优先)要求生产包能跑本地转录,直接打脸。不议。

## 后续影响

### 代码 / 打包

- `scripts/after-pack.cjs`(T30 落地):
  - glob 找 `app.asar.unpacked/node_modules/sherpa-onnx-*/**/*.dylib`
  - `install_name_tool -id @loader_path/<basename>` 改自身 install_name
  - `install_name_tool -change <old> @loader_path/<basename>` 改依赖
  - `codesign --force --options runtime --entitlements build/entitlements.mac.plist --sign "$APPLE_IDENTITY"` 重签每个 `.dylib` + `.node`
- `electron-builder.yml`:
  - `asarUnpack: ['node_modules/sherpa-onnx/**', 'node_modules/sherpa-onnx-*/**']`(必须,native 二进制不能在 asar 里)
  - `afterPack: scripts/after-pack.cjs`
  - `mac.hardenedRuntime: true`
  - `mac.entitlements: build/entitlements.mac.plist`(含 `com.apple.security.cs.allow-unsigned-executable-memory` + `allow-jit` — onnxruntime 必需)

### 验证

- T19 macOS CI smoke 测试**必须**跑签名 + 公证后的包(`spctl --assess accepted`),不能只跑 dev 模式;dev 通过不算数
- `pnpm verify:prebuilt`(dev-environment.md §3.2)只验 dev 模式可加载,生产路径需要 packaged smoke test 兜底
- spike-004 已验证一次完整签名 + 公证链,但 spike-004 用的是 hello world addon;sherpa-onnx 复杂度更高,T30 PR 第一次合包前必须本地至少 packaged 一次

### 文档

- ✅ tech-feasibility §R3 / §R4 / §R5.1 已写背景与方案概述
- ✅ sherpa-onnx-research §5.1 / §5.2 / §5.4 已写体积估算与坑点
- 🔲 transcription-pipeline §3.2(loader)需要在 T30 PR 时把"加载链"小节扩到包含 `@loader_path` 解析路径
- 🔲 build-and-release §macOS 章节需要单独写 afterPack hook 节(留到 build-and-release.md 完整版,M3 起草)

### 风险与回退

- **风险**:`install_name_tool` 改写后 `.dylib` 的 ad-hoc 签名失效;重签时 entitlements 配错会公证失败("Stapler error 65")。
  - 缓解:T19 CI smoke 测试每个 PR 都跑,问题尽早暴露
- **回退路径**:如果未来 sherpa-onnx 上游改用 framework 或 rpath 已经预置 `@loader_path`,候选 A 的脚本可作 no-op 保留兼容,无需移除

## 后续 ADR 接力

- **ADR-0003** ASR 跑 utility process — 与本 ADR 平行,utility 加载 `sherpa-onnx-node` 时同样吃这条 @loader_path 链
- **ADR-0004** Pass A 引擎选型(已 accepted)— Pass A / Pass B 共享同一个 `sherpa-onnx-node` 实例,本 ADR 的影响面**只多不少**
