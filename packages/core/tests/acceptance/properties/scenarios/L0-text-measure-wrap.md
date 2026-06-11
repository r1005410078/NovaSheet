---
id: core.L0.text-measure-wrap
layer: L0
summary: tokenize 与 wrapText 换行契约
tags: [measure, pure]
status: implemented
---

## User Story

作为 Core 集成方，当我测量换行文本时，我希望 `tokenize` 按词切分且 `wrapText` 在窄宽度下产生多行。

## Given

- 文本 `hello world`
- 固定宽度 measurer

## When

- 调用 `tokenize` 与 `wrapText`

## Then

- tokenize 含空格分词
- wrapText 行数大于 1
