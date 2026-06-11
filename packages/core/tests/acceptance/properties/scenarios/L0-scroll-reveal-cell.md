---
id: core.L0.scroll-reveal-cell
layer: L0
summary: computeScrollReveal 计算 scroll 偏移以露出目标 cell
tags: [scroll, pure]
status: implemented
---

## User Story

作为 Core 集成方，当我需要把 active cell 滚入视口时，我希望 `computeScrollReveal` 在 cell 已可见时返回 null，否则给出 logical scroll 目标。

## Given

- ChunkedAxis 行/列轴
- 固定 viewport 与 header 尺寸

## When

- 对已在视口内的 cell 调用 `computeScrollReveal`
- 对视口下方/右侧的 cell 调用 `computeScrollReveal`

## Then

- 可见 cell 返回 null
- 不可见 cell 返回非 null logicalX 或 logicalY
