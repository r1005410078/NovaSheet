---
id: core.L2.grid-format-text-wrap-cycle
layer: L2
summary: Grid setTextWrap 在 overflow/wrap/clip 间切换
tags: [grid, format]
status: implemented
---

## User Story

作为 Grid facade 使用者，当我切换文本换行模式时，我希望 `getViewCellFormat` 依次反映 overflow、wrap、clip 三态。

## Given

- 一个 mounted Grid
- 单格选区

## When

- 依次调用 `setTextWrap(range, 'overflow' | 'wrap' | 'clip')`

## Then

- 每次调用后 `getViewCellFormat` 的 textWrap 与输入一致
