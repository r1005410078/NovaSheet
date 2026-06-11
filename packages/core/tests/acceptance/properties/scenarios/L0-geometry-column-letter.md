---
id: core.L0.geometry-column-letter
layer: L0
summary: columnIndexToLetter 0-based 列索引转 Excel 字母
tags: [geometry, pure]
status: implemented
---

## User Story

作为 Core 集成方，当我需要显示列标时，我希望 `columnIndexToLetter` 将 0-based 索引映射为 Excel 风格字母。

## Given

- 列索引 0、25、26

## When

- 调用 `columnIndexToLetter`

## Then

- 分别返回 A、Z、AA
