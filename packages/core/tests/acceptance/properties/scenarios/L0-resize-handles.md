---
id: core.L0.resize-handles
layer: L0
summary: computeResizeHandles 与 resize 常量
tags: [interaction, pure]
status: implemented
---

## User Story

作为 Core 集成方，当我布局列头 resize 热区时，我希望 `computeResizeHandles` 为可见列生成 handle，且公开常量为正数。

## Given

- 含多列的 RenderFrame

## When

- 调用 `computeResizeHandles` 并读取 `RESIZE_HANDLE_HIT_SIZE`

## Then

- 至少一个 column handle
- 常量大于 0
