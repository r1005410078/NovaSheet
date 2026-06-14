---
id: excel.L3c.rich-text-toolbar-bold-substring
layer: L3c
summary: 注册 cell-kit 后外部 React toolbar 可加粗编辑态子串
tags: [cell-extension, rich-text, editing, toolbar]
status: draft
---

## User Story

作为用户，当我在注册 cell-kit richTextExtension 的表格里编辑单元格并选中部分文字时，我希望表格上方的 React toolbar 能加粗该子串，以获得 Google 表格同款 rich-text 体验。

## Given

- 注册 richTextExtension（codec+renderer+editor）的 Grid
- React toolbar 挂载 rich-text extension item
- 某 text 单元格值为 'abcd'

## When

- 编辑该格
- 在 inline editor 内选中 'bc'
- 点击外部 React toolbar 的 Bold 按钮并提交

## Then

- 'richText' 附件存 [1,3) bold run
- renderer 切段绘制时 'bc' 段 font 含 bold
