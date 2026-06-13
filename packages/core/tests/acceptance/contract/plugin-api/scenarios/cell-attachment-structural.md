---
id: core.L1.cell-attachment-follows-row-insert
layer: L1
summary: 插入行后附件跟随 raw cell 下移
tags: [grid, attachment, structural, remap]
status: implemented
---

## User Story

作为单元格扩展作者，当用户在附件所在行之前插入行时，我希望附件跟随它所属的 raw cell 一起下移，不错位、不丢失。

## Given

- 一个 mounted Grid，注册 namespace `demo`
- 在 raw cell (row=2,col=0) 设了附件 `{ note: 'y' }`

## When

- 在 row=0 前插入 1 行

## Then

- `grid.getCellAttachment('demo', 3, 0)` 返回 `{ note: 'y' }`
- `grid.getCellAttachment('demo', 2, 0)` 返回 `undefined`
