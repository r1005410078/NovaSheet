---
id: core.L0.context-menu-items
layer: L0
summary: 单元格/行头/列头上下文菜单完整清单与黄金文件一致
tags: [context-menu, pure, golden]
status: implemented
---

## User Story

作为 Core 集成方，当我构建上下文菜单时，我希望公开 helper 返回稳定的 cut/copy/paste 与行列结构项 id。

## Given

- 单元格菜单 context
- 行头选中 2 行
- 列头 context（含 sort/filter pipeline）

## When

- 调用三个 `get*ContextMenuItems` helper

## Then

- 三组菜单的完整 id/label/disabled/分隔符清单与 `__goldens__/core.L0.context-menu-items.golden.txt` 一致——任何菜单项增删、文案或顺序变化显式过 review
