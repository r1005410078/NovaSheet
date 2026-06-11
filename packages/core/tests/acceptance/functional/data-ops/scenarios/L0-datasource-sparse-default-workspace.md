---
id: core.L0.datasource-sparse-default-workspace
layer: L0
summary: SparseExcelDataSource 默认 A-Z x 1000 且只物化非空单元格
tags: [datasource, excel-workspace]
status: implemented
---

## User Story

作为 Excel 工作区使用者，当我创建稀疏数据源时，我希望默认获得 A-Z x 1000 的逻辑表格，但空白单元格不被物化，写入后内容边界可观测。

## Given

- 默认 `SparseExcelDataSource`

## When

- 读取初始 row count 和 schema
- 写入 `B3`
- 查询 content bounds

## Then

- row count 为 1000
- schema 首尾为 `A` / `Z`
- 只写入的 `B3` 进入 content bounds
