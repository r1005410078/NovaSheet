---
id: core.L0.edit-parse-format
layer: L0
summary: 单元格编辑解析与可编辑类型判定
tags: [edit, pure]
status: implemented
---

## User Story

作为 Core 集成方，当我实现单元格编辑器时，我希望公开 edit helper 能判定可编辑列类型并解析 text/number 输入。

## Given

- text 与 number 字段类型
- 典型编辑输入

## When

- 调用 `isEditableFieldType`、`formatCellForEdit`、`parseCellEditInput`、`isTypableEditKey`

## Then

- 仅 text/number 可编辑
- number 非法输入返回 undefined
- 可打印字符键可键入
