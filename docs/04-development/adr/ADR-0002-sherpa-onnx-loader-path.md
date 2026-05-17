# ADR-0002 sherpa-onnx 在 macOS 的 @loader_path 加载链

- **状态**:proposed(占位,T01 落地;完整理由 / 候选对比待补)
- **日期**:2026-05-17
- **相关**:[`../../01-research/sherpa-onnx-research.md`](../../01-research/sherpa-onnx-research.md) / [`../../03-architecture/transcription-pipeline.md`](../../03-architecture/transcription-pipeline.md) §3.2

## 背景

sherpa-onnx-node 在 macOS 上由一个 `.node` addon + 一组 `.dylib`(libsherpa-onnx-core / libonnxruntime 等)组成。npm prebuilt 里的 dylib `install_name` 是**绝对路径**(指向构建机的 `node_modules`)。

dev 模式靠 `DYLD_FALLBACK_LIBRARY_PATH` 兜底能加载,但 **packaged + 公证后的 .app** 里:

- macOS SIP 启动 Helper 时**剥离 DYLD\_\*** 环境变量
- 绝对路径指向构建机不存在的目录 → `dyld: Library not loaded` → ASR 全挂

## 决策(一句话)

**afterPack hook 用 `install_name_tool` 把所有 sherpa-onnx 相关 dylib 的 install_name 改写成 `@loader_path/<basename>`,再重签,使运行时按 .node 同目录解析 dylib。**

## 候选与否决理由

待补 — 见 sherpa-onnx-research §5。需要扩充:

- 候选 A:`@loader_path` 改写 + 重签(选)
- 候选 B:运行时设 `DYLD_FALLBACK_LIBRARY_PATH`(SIP 剥离,失败)
- 候选 C:把 dylib 链接成 framework 放进 .app `Frameworks/`(改动大、与 sherpa-onnx 上游脱节)

## 后续影响

- `scripts/after-pack.cjs`:实现 install_name 改写脚本(T30)
- CI 必须做"签名+公证后启动 smoke test",dev 验证不算数(PRD §11 风险表第 1 条)
- spike-004 已验证签名 + 公证完整链;ADR 写完后 T19 加 mac smoke job
