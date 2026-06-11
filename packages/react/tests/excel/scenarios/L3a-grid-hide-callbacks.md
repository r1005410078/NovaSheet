---
id: excel.L3a.grid-hide-callbacks
layer: L3a
summary: ref 隐藏行列触发隐藏状态回调
status: draft
---

## User Story

作为集成方，当我通过 NovaExcel ref 隐藏或取消隐藏行列时，我希望隐藏状态回调能反映当前隐藏集合，以便外部 UI 与 Grid 的可见性状态保持同步。

## Given

- NovaExcel 已挂载，持有 ref
- 传入 onHideChange / onHideColsChange

## When

- 通过 ref.current.grid 调用 hideRows / unhideRows / hideCols / unhideCols

## Then

- onHideChange 收到当前 hidden row id 集合
- onHideColsChange 收到当前 hidden field id 集合
