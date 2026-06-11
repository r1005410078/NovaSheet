---
id: core.L0.clipboard-paste-target-merge-conflict
layer: L0
summary: 粘贴目标与合并区冲突检测
tags: [clipboard, pure]
status: implemented
---

## User Story

作为 Core 集成方，当粘贴目标与已有合并区部分重叠时，我希望 `pasteTargetConflictsWithMerges` 返回 true，以便上层跳过粘贴。

## Given

- 单格粘贴目标
- 跨 2×2 的 merge region

## When

- 调用 `pasteTargetConflictsWithMerges`

## Then

- 返回 true
