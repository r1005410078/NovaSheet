---
id: core.L0.theme-dense-grid-tokens
layer: L0
summary: denseGridTheme 整棵 token 树与黄金文件一致
tags: [theme, pure, golden]
status: implemented
---

## User Story

作为 Core 集成方，当我消费默认主题时，我希望 `denseGridTheme` 暴露完整的 metrics/colors/cell token 树，以便渲染层不硬编码视觉值。

## Given

- 公开导出的 `denseGridTheme`

## When

- 读取 `metrics`、`colors`、`cell` 子树

## Then

- 整棵 theme JSON 与 `__goldens__/core.L0.theme-dense-grid-tokens.golden.txt` 一致——theme 是视觉值唯一来源，任何 token 增删改都显式过 review
