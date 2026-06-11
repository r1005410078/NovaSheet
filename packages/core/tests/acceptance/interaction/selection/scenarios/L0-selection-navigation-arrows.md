---
id: core.L0.selection-navigation-arrows
layer: L0
summary: 键盘导航键解析与 applySelectionNavigation 单步移动
tags: [selection, navigation, pure]
status: implemented
---

## User Story

作为 Core 集成方，当我处理方向键与 Tab/Enter 时，我希望公开 pure API 能解析按键意图并计算下一 active cell，以便 DOM 层无需复制导航规则。

## Given

- 一个带初始选区的 SelectionNavigationTarget
- 10×5 网格边界

## When

- 调用 `parseSelectionNavigationKey('ArrowRight', false)`
- 调用 `applySelectionNavigation(model, intent, bounds)`

## Then

- 解析结果为 delta 意图
- 下一 cell 为 `(0, 1)`
- 未映射按键返回 null
