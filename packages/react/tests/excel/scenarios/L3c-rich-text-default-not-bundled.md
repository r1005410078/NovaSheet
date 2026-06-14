---
id: excel.L3c.rich-text-default-not-bundled
layer: L3c
summary: 默认 Grid 不带 rich-text；未注册 cell-kit 时纯文本无字体组
tags: [cell-extension, rich-text]
status: draft
---

## User Story

作为集成方，当我不注册 `@novasheet/cell-kit` 时，我希望 NovaSheet 默认渲染纯文本、无任何字体组能力，以保证默认包零基础组件、可 tree-shake。

## Given

- 默认 NovaExcel（未注册 richTextExtension）

## When

- 渲染 text 列

## Then

- 单元格走内置纯文本路径，无 rich-text renderer 介入；richTextExtension 不出现在 @novasheet/react 默认导出
