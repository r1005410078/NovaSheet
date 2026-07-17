---
id: core.L2.grid-frozen-pane-selection
layer: L2
summary: 冻结窗格按 selectionBehavior 配置选择整行、整列或单元格
tags: [grid, selection, frozen]
status: draft
---

## User Story

作为 Grid facade 使用者，当我把左冻结窗格声明为行选择器、顶部冻结窗格声明为列选择器时，我希望点击对应窗格的数据格分别选中整行、整列，而交叉数据区仍按单元格选择，以便用冻结窗格承载行/列标识的监视表可以整行、整列高亮。

## Given

- 一个 mounted Grid，`frozen: { leftCols: 1, topRows: 1 }`
- `selectionBehavior.frozenPanes` 配置 `left: 'row'`、`top: 'column'`、`topLeft: 'cell'`
- 注册 `onSelectionChange` 回调

## When

- 分别 pointerdown 点击左冻结窗格数据格、顶部冻结窗格数据格与两者交叉数据格

## Then

- 点击左冻结格后选区为该行的全列连续范围，`activeCell` 锚在行首（与行头点击一致）
- 点击顶部冻结格后选区为该列的全行连续范围，`activeCell` 锚在列首（与列头点击一致）
- 点击交叉数据格后选区为该单元格本身
- `onSelectionChange` 依次获得对应连续范围
- 未配置 `selectionBehavior` 时，同样的点击均为普通单元格选择
