<!--
LazyAudio PR 模板。配套 docs/04-development/progress.md §0 SOP。
- 任何 PR 都要填这个模板，可以删掉不相关的小节
- T / spike / ADR 类任务必须勾完所有 checkbox 才能合
-->

## Task

Closes <!-- T01 / spike-011 / ADR-0001 --> — <!-- 一句话标题 -->

里程碑：<!-- Pre-M3 / M3 / M4 / M5 / M6 / M7 -->

## Type

- [ ] T (code task)
- [ ] spike
- [ ] ADR
- [ ] bugfix（不在 dev-plan 编号内）
- [ ] doc / refactor / chore

## AC verification

> 抄 [`docs/04-development/development-plan.md`](../docs/04-development/development-plan.md) 里这条任务的 AC bullet，逐条勾。每条后面贴：命令输出片段 / 截图链接 / CI 链接 / commit ref。

- [ ] AC 1: <!-- 怎么验的 + 证据 -->
- [ ] AC 2: <!-- ... -->
- [ ] AC 3: <!-- ... -->

## progress.md updated

- [ ] §4.x 对应里程碑的表格：🔄 → ✅，填完成日期 + 本 PR 编号
- [ ] §1 当前焦点：已移除该任务（含子 checkbox）
- [ ] 顶部「最后更新」改成今天
- [ ] 速查面板：done +1 / wip -1（spike / ADR 同步）

## 偏离 / 决策

> 写实际做的和 dev-plan 不一致的地方、临时取舍、需要回写 03-architecture 或 PRD 的点。没有就写"无"。

## Follow-up

> 这次没顺手做但应该做的事：dead code、stale doc、缺测试、TODO/FIXME。没有就写"无"。

## Notes

> 截图、踩坑、性能数字等任何想保留的现场。
