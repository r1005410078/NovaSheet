---
id: core.L2.grid-column-groups-structural-mutations
layer: L2
summary: insert/delete/moveCols 与组树的一致性：归组规则、级联移除 + undo 恢复、跨组保守 no-op
tags: [column-groups, structural, undo]
status: draft
---

## User Story

作为 Core 集成方，我做列结构变更时希望组树自动保持一致（引用永远指向存在且连续的列），删除的组能随 undo 恢复，而会破坏组连续性的列移动被保守拒绝。

## Given

- `fields`: `[m, s1c1, s1c2, s2c1, s2c2]`
- `columnGroups`: `[{ fieldId: 'm' }, { id: 's1', label: '堆1', children: [s1c1, s1c2] }, { id: 's2', label: '堆2', children: [s2c1, s2c2] }]`

## When / Then

1. `insertCols` 插入点在 `s1c1` 与 `s1c2` 之间（组内部）：新列归入 `s1`（`getColumnGroups()` 中 `s1` 变 3 叶）
2. `insertCols` 插入点在 `s1` 与 `s2` 边界：新列不归任何组（顶层 `{ fieldId }` 形态）
3. `deleteCols(['s1c1', 's1c2'])`：组 `s1` 从组树级联移除；`undo()` 后 fields 与组树完整恢复（`s1` 回来且叶序正确）
4. `moveCols(['s1c2'], 's2c2' 之前)`（跨组边界）：返回 `false`，fields 与组树均不变
5. `moveCols(['s1c2'], 's1c1' 之前)`（同组内部）：返回 `true`，`s1` 叶序随 fields 同步为 `[s1c2, s1c1]`，frame 组头区间不变
