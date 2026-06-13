---
id: core.L2.grid-fill-style-propagates
layer: L2
summary: 填充时源格格式（填充色/边框/textWrap/valueFormat）覆盖目标格
tags: [grid, fill, format]
status: implemented
---

## User Story

作为 Core 使用者，当我向下填充带格式的源格时，我希望 `getViewCellFormat` 在目标格反映源格的全部格式轴（填充色/边框/textWrap/valueFormat），且源格无某轴格式时目标格的陈旧值被清除——对齐 Google 表格的填充覆盖语义。

## Given

- headless engine
- 源格已设置 fillColor / valueFormat 等格式

## When

- 调用 `commitFill` 向下填充

## Then

- 目标格 `getViewCellFormat` 的 fillColor、textWrap、valueFormat 与源格一致
- 源格未设某轴格式时，目标格该轴的陈旧值被清除
