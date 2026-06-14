---
id: excel.L3c.rich-text-toolbar-bold-substring
layer: L3c
summary: 注册 cell-kit 后选中子串加粗→提交→renderer 显示 bold
tags: [cell-extension, rich-text, editing]
status: draft
---

## User Story

作为用户，当我注册 cell-kit 的 richTextExtension 并对某单元格选中部分文字点加粗时，我希望提交后该子串以粗体渲染，以获得 Excel 同款 rich-text 体验。

## Given

- 注册 richTextExtension（codec+renderer+editor）的 Grid，某 text 单元格值 'abcd'

## When

- 编辑该格，将 'bc' 加粗并提交

## Then

- 'richText' 附件存 [1,3) bold run；renderer 切段绘制时 'bc' 段 font 含 bold
