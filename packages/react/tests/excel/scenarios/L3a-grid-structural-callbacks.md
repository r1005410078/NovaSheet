---
id: excel.L3a.grid-structural-callbacks
layer: L3a
summary: ref 结构变更触发行列回调
status: draft
---

## User Story

作为集成方，当我通过 NovaExcel ref 调用底层 Grid 的行列结构 API 时，我希望对应 props 回调被触发，以便外部状态栏、审计日志或协同层能观察到结构变更。

## Given

- NovaExcel 已挂载，持有 ref
- 传入 onRowsInserted / onRowsDeleted / onColumnsInserted / onColumnsDeleted

## When

- 通过 ref.current.grid 调用 insertRows / deleteRows / insertCols / deleteCols

## Then

- onRowsInserted 收到插入位置、数量与新行 id
- onRowsDeleted 收到删除的 row id
- onColumnsInserted 收到插入位置、数量与新字段
- onColumnsDeleted 收到删除的 field id
