---
id: core.L2.grid-clipboard-copy-cut-paste-roundtrip
layer: L2
summary: Grid copy/cut/paste 通过 facade 完成选区往返
tags: [grid, clipboard]
status: implemented
---

## User Story

作为 Grid facade 使用者，当我复制、剪切并粘贴选区时，我希望公开 `copy` / `cut` / `paste` 与事件回调能正确读写单元格值。

## Given

- 一个 mounted Grid
- stub 的 `navigator.clipboard`
- 已知单元格值与选区

## When

- 调用 `copy()` 后粘贴到另一格
- 调用 `cut()` 后粘贴到另一格

## Then

- `onCopy` / `onCut` / `onPaste` 收到对应 range
- 目标格写入源格值
- cut 后源格被清空
