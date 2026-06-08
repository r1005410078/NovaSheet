---
id: excel.L3a.no-toolbar
layer: L3a
summary: showToolbar false 隐藏 toolbar
status: draft
---

## User Story

作为集成方，当我需要自定义工具栏或嵌入只读表格时，我希望关闭内置 toolbar 后表格区域仍正常显示，以便用自有 UI 驱动同一套 Grid。

## Given
- 渲染 NovaExcel，showToolbar: false

## When
- 挂载完成

## Then
- 无 toolbar DOM
- grid/canvas 仍在
