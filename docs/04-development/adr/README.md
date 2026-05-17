# Architecture Decision Records

存放架构 / 技术选型决策记录。

**格式**：每个 ADR 一个文件,文件名 `ADR-NNNN-<slug>.md`。NNNN 单调递增,不复用。

**结构**(每条 ~1 页):

- 背景
- 候选方案
- 选哪个
- 否决理由
- 后续影响

**状态**:`proposed` / `accepted` / `superseded by ADR-NNNN` / `deprecated`

**何时新增**:重要、不可逆、跨子系统的决策。普通实现细节走 PR description,不进 ADR。

**何时改**:不改。要修正用新 ADR superseded 旧的。
