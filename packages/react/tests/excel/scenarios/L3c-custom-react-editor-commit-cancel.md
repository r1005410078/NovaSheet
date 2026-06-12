---
id: excel.L3c.custom-react-editor-commit-cancel
layer: L3c
summary: React cell editor adapter 提交与取消
tags: [cell-extension, react, editing]
status: draft
---

## User Story

作为 React 集成方，当我用 `createReactCellEditor` 注册业务选择器时，我希望 React 组件能通过 props 提交或取消编辑，并由 NovaExcel / Grid 统一清理 overlay 生命周期。

## Given

- NovaExcel 使用 `assignee` 字段
- `cellEditors.assignee` 由 `createReactCellEditor(AssigneePicker, { kind: "popover" })` 创建
- 当前单元格 raw value 为 `"Alice"`

## When

- 用户打开 assignee editor 并在 React 组件中点击 `"Bob"`
- 用户再次打开 editor 后点击 Cancel

## Then

- 第一次操作调用 `commit("Bob")` 并写回 Grid 数据
- editor overlay unmount
- 第二次操作调用 `cancel()`，不改变 raw value
- React 组件没有参与 cell canvas 绘制
