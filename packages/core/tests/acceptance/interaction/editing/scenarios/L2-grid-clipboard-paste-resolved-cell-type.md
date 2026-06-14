---
id: core.L2.grid-clipboard-paste-resolved-cell-type
layer: L2
summary: paste 按目标格 resolved type 强转且不传播源类型
tags: [grid, clipboard, paste, cell-type]
status: draft
---

## User Story

作为 Core 使用者，当我把 TSV 粘贴到带 cell type override 的目标区域时，我希望每个目标格按自己的 resolved type 强转输入值，同时不把源格类型传播到目标格，以便 paste 与显式 fill 的类型传播语义保持区分。

## Given

- 一个 mounted Grid
- 目标区域跨 text、number、date、checkbox 默认列
- 目标区域中部分单元格已有 cell type override
- TSV 中包含数字、ISO 日期、布尔值和非法字符串

## When

- 调用 paste 到目标区域

## Then

- 每个目标格按目标 resolved type coerce
- 无法 coerce 的格被 skip，reason 为 `type`
- paste 不创建或修改 cell type override
- typed clipboard cache 命中时值原样写入，仍不传播源类型
