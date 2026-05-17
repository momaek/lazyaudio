# 03 — 技术架构

UX 定型后，决定怎么实现。

## 计划文档

- _overview.md_ — 整体架构图、主进程 / 渲染进程 / Native 模块的边界
- _audio-capture.md_ — macOS（ScreenCaptureKit）/ Windows（WASAPI loopback）的采集方案
- _transcription-pipeline.md_ — sherpa-onnx 本地 + OpenAI 兼容 API 云端的统一抽象
- _data-model.md_ — 录音元数据、转录段落、设置的存储格式
- _ipc-contract.md_ — 主进程和渲染进程之间的 IPC 协议
- _adr/_ — Architecture Decision Records（关键技术决策的取舍记录）

## 进入条件

`02-design/` 中关键流程画完。
