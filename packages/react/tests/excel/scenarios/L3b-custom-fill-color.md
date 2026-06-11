---
id: excel.L3b.custom-fill-color
layer: L3b
summary: 自定义取色器选半透明色后派发 fill-color
tags: []
status: draft
---

## User Story

作为表格用户，当内置色板没有我要的颜色时，我希望用自定义取色器（含透明度）选色并应用到选区，以便实现半透明填充效果。

## Given

- NovaExcel 已挂载，监听 onToolbarAction

## When

- 打开填充颜色 popover → 点「+」进入取色器 → hex 输入 `#ff000080` → 点确定

## Then

- onToolbarAction 收到 `{ id: 'fill-color', color: '#ff000080' }`
- popover 关闭
