---
id: excel.L3c.eyedropper-feature-detect
layer: L3c
summary: 无 EyeDropper API 时吸管不渲染
tags: []
status: draft
---

## User Story

作为 Firefox/Safari 用户，我不希望看到一个点了没反应的吸管按钮，以便界面诚实反映能力。

## Given

- 环境无 `window.EyeDropper`（happy-dom 默认）

## When

- 打开填充颜色 popover

## Then

- 自定义区不渲染吸管按钮（`[data-custom-color-eyedropper]` 不存在）
