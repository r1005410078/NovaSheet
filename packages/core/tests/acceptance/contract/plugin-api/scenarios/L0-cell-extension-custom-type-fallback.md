---
id: core.L0.cell-extension-custom-type-fallback
layer: L0
summary: 未注册 custom FieldType 文本 fallback 且不可编辑
tags: [cell-extension, plugin-api]
status: draft
---

## User Story

作为 Core 集成方，当文档 schema 含有当前运行环境未注册的自定义 `FieldType` 时，我希望表格仍能打开并显示原始值文本，但不允许用户直接编辑未知业务类型，以免插件缺失时破坏数据语义。

## Given

- schema 中有字段 `{ id: "score", type: "rating" }`
- `GridOptions.cellTypes` / `cellEditors` / backend `cellRenderers` 均未注册 `rating`
- 该列某个单元格 raw value 为 `4`

## When

- runtime 或 renderer 读取该单元格用于显示
- 用户尝试通过双击、Enter/F2、直接键入进入编辑态

## Then

- 单元格显示 fallback 文本 `4`
- 不抛出 unknown field type 错误
- 不打开 editor
- 数据源 raw value 保持 `4`
