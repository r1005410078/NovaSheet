---
id: excel.L3c.redo-button-state
layer: L3c
summary: redo 按钮启用/禁用
status: draft
---

## User Story

作为表格用户，当我撤销了一个可重做操作后，我希望重做按钮变为可点；当我重做完成且无可重做项时，按钮应变灰。

## Given

- NovaExcel 已挂载
- 已产生一个可撤销操作

## When

- 点击 undo 后再点击 redo

## Then

- redo 初始 disabled
- undo 后 redo enabled
- redo 后 redo disabled
