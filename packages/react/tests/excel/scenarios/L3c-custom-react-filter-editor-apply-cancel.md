---
id: excel.L3c.custom-react-filter-editor-apply-cancel
layer: L3c
summary: React filter editor adapter 应用与取消
tags: [cell-extension, react, filter]
status: draft
---

## User Story

作为 React 集成方，当我为自定义类型注册 filter editor 时，我希望 React filter UI 只负责采集 operator value，筛选语义仍由 `cellTypes[type].filterOperators` 执行，以便 UI 与 core 纯语义解耦。

## Given

- `assignee` 类型定义注册了 `assignee-is-any-of` filter operator
- `cellFilterEditors.assignee` 由 `createReactCellFilterEditor(AssigneeFilter)` 创建
- 表格中有 `"Alice"`、`"Bob"`、`"Carol"` 三个 assignee 值

## When

- 用户打开 assignee filter editor，选择 `"Alice"` 与 `"Bob"` 后 Apply
- 用户再次打开 filter editor 修改选择后 Cancel

## Then

- Apply 后 Grid filter 使用 `assignee-is-any-of.matches()` 只保留 Alice/Bob 行
- filter editor overlay unmount
- Cancel 不改变当前 filter spec
- React filter editor 不包含 filter predicate 逻辑
