---
id: core.L1.cell-attachment-fill-propagate
layer: L1
summary: fill 柄向下平铺携带源格附件，undo 整体撤销
tags: [grid, attachment, fill, undo]
status: implemented
---

## User Story

作为单元格扩展作者，当用户从含附件的源格向下拖填充柄时，我希望附件随之平铺到目标格（对齐 Google 携带格式），undo 能整体撤销。

## Given

- mounted Grid（`DefaultGridEngine`），注册 namespace `demo`
- raw (0,0) 设附件 `{ v: 1 }`

## When

- 选中 (0,0)，向下 fill 到 (1,0) 和 (2,0)（`commitFill` source=(0,0), fill=(1,2,0,0), direction='down'）

## Then

- `getCellAttachment('demo', 1, 0)` 返回 `{ v: 1 }`
- `getCellAttachment('demo', 2, 0)` 返回 `{ v: 1 }`
- undo 后 `getCellAttachment('demo', 1, 0)` 为 `undefined`
- undo 后 `getCellAttachment('demo', 2, 0)` 为 `undefined`
- undo 后 `getCellAttachment('demo', 0, 0)` 仍为 `{ v: 1 }`（源格保留）
