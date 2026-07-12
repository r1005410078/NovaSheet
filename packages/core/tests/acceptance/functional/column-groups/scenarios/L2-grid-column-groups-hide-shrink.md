---
id: core.L2.grid-column-groups-hide-shrink
layer: L2
summary: hideCols 使组头按可见叶列收缩，全隐则组头从 frame 消失；组树本身不变，unhide 恢复
tags: [column-groups, hide-cols, view]
status: implemented
---

## User Story

作为 Core 集成方，我隐藏组内部分列时希望组头宽度跟随收缩；组内列全部隐藏时组头消失但组配置保留，取消隐藏后完整恢复——隐藏是 view 层概念，不应改写组树。

## Given

- `fields`: `[m, s1c1, s1c2, s1c3, s2c1]`
- `columnGroups`: `[{ fieldId: 'm' }, { id: 's1', label: '堆1', children: [s1c1, s1c2, s1c3] }, { id: 's2', label: '堆2', children: [s2c1] }]`

## When

1. `hideCols(['s1c2'])`（隐藏 s1 中间一列）
2. 继续 `hideCols(['s1c1', 's1c3'])`（s1 全隐）
3. `unhideCols(['s1c1', 's1c2', 's1c3'])`

## Then

- 步骤 1 后：`columnGroupHeader.rows` 中 `s1` 的 view 列区间收缩为 2 列宽（按可见叶列计）；`getColumnGroups()` 返回的组树不变（仍含 3 个叶引用）
- 步骤 2 后：`rows` 中不存在 `s1` 的 cell；`s2` 区间左移补位；`getColumnGroups()` 组树仍不变
- 步骤 3 后：frame 组头布局与初始状态完全一致
- 全程 `selectGroup('s1')` 在全隐期间返回 `false` 且不动选区
