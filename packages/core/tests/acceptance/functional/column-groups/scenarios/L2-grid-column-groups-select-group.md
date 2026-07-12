---
id: core.L2.grid-column-groups-select-group
layer: L2
summary: selectGroup 产生整列 range 选区；组头 selected 按 ⊇ 派生（含父组与相邻多组）
tags: [column-groups, selection]
status: implemented
---

## User Story

作为 Core 集成方，我调用 `selectGroup(groupId)` 时希望得到覆盖该组全部可见叶列的整列选区（`GridSelection` 结构不变），并在 frame 组头上看到派生高亮；框选恰好覆盖组的等价范围时高亮行为一致。

## Given

- `fields`: `[m, aXc1, aXc2, aYc1]`，行数 10
- `columnGroups`: `[{ fieldId: 'm' }, { id: 'a', label: 'A相', children: [{ id: 'aX', label: '堆X', children: [aXc1, aXc2] }, { id: 'aY', label: '堆Y', children: [aYc1] }] }]`

## When / Then

1. `selectGroup('aX')` 返回 `true`；`getSelection().selectedRange === { startRow: 0, endRow: 9, startCol: 1, endCol: 2 }`；frame 中 `aX.selected === true`，`aY.selected === false`，父组 `a.selected === false`
2. `setSelection` 手工构造覆盖 view 列 `[1, 3]` 的整列 range（= aX + aY 全部叶列）：`aX`、`aY`、父组 `a` 三个组头 `selected` 均为 `true`（⊇ 规则，递归向上）
3. `setSelection` 构造 view 列 `[1, 2]` 但行区间非整列（`startRow: 1`）：所有组头 `selected === false`
4. `selectGroup('ghost')` 返回 `false`，选区保持不变
