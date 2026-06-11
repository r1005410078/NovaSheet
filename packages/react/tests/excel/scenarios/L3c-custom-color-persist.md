---
id: excel.L3c.custom-color-persist
layer: L3c
summary: 自定义颜色 swatch 跨卸载重挂留存
tags: []
status: draft
---

## User Story

作为表格用户，当我添加过自定义颜色后，我希望下次打开调色板时它还在，以便复用同一颜色。

## Given

- localStorage 干净；NovaExcel 已挂载

## When

- 经取色器添加 `#00ff0080` 并应用 → 卸载 → 重新挂载 → 再次打开填充颜色 popover

## Then

- 自定义区出现 `data-fill-color="#00ff0080"` swatch
