---
id: core.L2.grid-format-borders-presets
layer: L2
summary: Grid setBorders 与 borderPatchForCell 边框预设
tags: [grid, format]
status: implemented
---

## User Story

作为 Grid facade 使用者，当我应用 outer 边框预设时，我希望公开 `setBorders` 写入 view 格式，且 `borderPatchForCell` 仅在范围外缘生成边线。

## Given

- 一个 mounted Grid
- 2×2 选区与 solid 边框样式

## When

- 调用 `setBorders(range, 'outer', border)`
- 对角落与内部格调用 `borderPatchForCell`

## Then

- `getViewCellFormat` 在外缘格显示边框
- 内部格 `borderPatchForCell` 返回空 patch
