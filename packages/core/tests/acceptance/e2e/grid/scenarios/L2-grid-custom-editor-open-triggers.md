---
id: core.L2.grid-custom-editor-open-triggers
layer: L2
summary: 自定义 editor 由所有编辑入口统一触发
tags: [cell-extension, editing, grid]
status: draft
---

## User Story

作为 Grid 集成方，当我为自定义类型注册 editor 时，我希望双击、Enter/F2、直接键入和 API 打开编辑器都进入同一个 `openCellEditor(ctx)` 流程，以便 editor 只处理一套 trigger contract。

## Given

- Grid 使用字段 `{ id: "owner", type: "assignee" }`
- `GridOptions.cellEditors.assignee` 注册了 popover editor
- 当前选中 `owner` 单元格，raw value 为 `"Alice"`

## When

- 用户双击该单元格
- 用户按 Enter 或 F2
- 用户直接键入字符 `B`
- 集成方调用公开 API 请求打开该单元格 editor

## Then

- 每种入口都调用同一个 editor `open(ctx)`
- `ctx.trigger` 分别标识 `double-click`、`enter` / `f2`、`typing`、`api`
- typing 入口携带 `ctx.initialInput = "B"`
- editor `commit("Bob")` 后通过 Grid facade 写回数据并触发重绘
