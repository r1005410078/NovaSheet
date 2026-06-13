---
id: core.L2.cell-attachment-store-set-get-undo
layer: L2
summary: 经 Grid 门面写/读 per-cell 附件并可撤销
tags: [grid, attachment, plugin-api, undo]
status: implemented
---

## User Story

作为单元格扩展作者，我希望经公开 `Grid.setCellAttachment` 把任意私有数据挂到某个 raw cell 上、能读回，并且写入可被 undo/redo，从而无需污染 core 也能承载非值数据。

## Given

- 一个 mounted Grid，注册了 namespace `demo` 的 codec
- 4 行 number 列数据

## When

- `grid.setCellAttachment('demo', 1, 0, { note: 'x' })`

## Then

- `grid.getCellAttachment('demo', 1, 0)` 返回 `{ note: 'x' }`
- `grid.undo()` 后该格附件为 `undefined`
- `grid.redo()` 后该格附件恢复 `{ note: 'x' }`
