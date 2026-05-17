# 04 — 开发

实现阶段的所有文档。按"先看怎么做、再看做什么"的顺序排列。

## 怎么做（工程规约）

按顺序读，每篇都自包含但相互引用：

1. [`project-structure.md`](./project-structure.md) — Electron + Vite + React 项目目录布局；新人理解仓库唯一入口
2. [`dev-environment.md`](./dev-environment.md) — 工具链、`git clone` → `pnpm dev`、国内镜像、调试、排错
3. [`coding-conventions.md`](./coding-conventions.md) — TypeScript / 命名 / 注释 / 错误处理 / IPC / 模块边界 / i18n
4. [`build-and-release.md`](./build-and-release.md) — electron-builder 配置、macOS 签名+公证、Windows 签名、CI 矩阵、自动更新

## 做什么（任务编排）

5. [`development-plan.md`](./development-plan.md) — **M3 → M7 的施工总图**：阻塞 spike、任务清单、退出条件、关键路径、时间预算
6. [`progress.md`](./progress.md) — **任务状态清单（活文档）**：spike / ADR / T01-T74 的 todo / wip / blocked / done 实时状态；Claude Code 每个 session 开头先读这里，结束前更新

## 持续维护（活文档，开发中追加）

- [`progress.md`](./progress.md) — 任务状态 + 周报存档（每天会动）
- _adr/_ — Architecture Decision Records；ADR-0001/0002/0003 在 M3 第一个 commit 前补出（见 [`../03-architecture/overview.md`](../03-architecture/overview.md) §9）
- _changelog.md_ — 版本发布记录（每个 release 前更新；release workflow 自动抽进 GitHub Release notes）
- _troubleshooting.md_ — 踩坑笔记（权限、native addon 编译、跨平台差异、公证翻车等真实案例）
- _release-notes/_ — 每个发布版本的 release notes 草稿

## 阅读路线

- **第一次进 04**：1 → 2 → 5 → 6（其它按需）
- **每天开工**：6（看当前 WIP / 下一步）→ 3 + 对应 03-architecture 文档
- **要写代码**：3 + 对应 03-architecture 文档
- **要发版**：4 + 5 的 §7 + 9 的发版 checklist
- **遇到 bug**：troubleshooting.md（持续追加）→ 还没记录的，修完后回写

## 进入条件

`03-architecture/` 主要文档完成（见 [`../03-architecture/done.md`](../03-architecture/done.md)）+ Pre-M3 spike / ADR 已完成（见 development-plan.md §2）。
