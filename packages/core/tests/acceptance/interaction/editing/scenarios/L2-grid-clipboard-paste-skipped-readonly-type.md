---
id: core.L2.grid-clipboard-paste-skipped-readonly-type
layer: L2
summary: 粘贴类型不匹配时 Grid 触发 onPasteSkipped
tags: [grid, clipboard]
status: implemented
---

## User Story

作为 Grid facade 使用者，当剪贴板文本无法写入 number 列时，我希望 `onPasteSkipped` 报告被跳过的单元格，而不是静默失败。

## Given

- 一个 mounted Grid
- number 列选区
- 剪贴板含非数字文本

## When

- 调用 `paste()`

## Then

- `onPasteSkipped` 收到 `reason: type`
- 目标格不被错误写入
