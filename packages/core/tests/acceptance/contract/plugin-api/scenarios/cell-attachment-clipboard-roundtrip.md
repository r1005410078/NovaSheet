---
id: core.L2.cell-attachment-clipboard-roundtrip
layer: L2
summary: copy/paste 同 Grid 内携带附件往返，undo 整体撤销；cache miss 安全降级无附件
tags: [grid, attachment, clipboard, undo]
status: implemented
---

## User Story

作为单元格扩展作者，当用户在同一 Grid 内复制含附件的格再粘贴到别处时，我希望附件经 codec 往返出现在目标格，undo 整体撤销（一次撤销同时还原值与附件）；跨 Grid/外部纯文本粘贴则安全降级无附件。

## Given

- mounted Grid（`GridRuntime` + `DefaultGridEngine`），注册 namespace `demo`
- raw (0,0) 设附件 `{ v: 9 }`

## When

- copy (0,0)（`handleClipboardCopy`），选中 (2,0)，paste（`handleClipboardPaste`，typed-cache 命中）

## Then

- `getCellAttachment('demo', 2, 0)` 返回 `{ v: 9 }`（codec 往返）
- undo 后 `getCellAttachment('demo', 2, 0)` 为 `undefined`（一次 undo 整体撤销值与附件）
- redo 后 `getCellAttachment('demo', 2, 0)` 再次返回 `{ v: 9 }`
