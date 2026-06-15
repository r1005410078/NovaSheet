---
id: core.L2.grid-cell-type-sort-mixed
layer: L2
summary: sort 在混合 resolved type 列中使用固定跨类型顺序
tags: [grid, view, sort, cell-type]
status: implemented
---

## User Story

作为 Grid facade 使用者，当同一列中存在 number/date/text/checkbox/empty 的混合 resolved type 时，我希望排序结果稳定且可预测，以便 cell 级类型覆盖不会让排序依赖隐式 JS 类型比较。

## Given

- 一个 mounted Grid
- 同一 fieldId 下多行值分别为 number、date serial、text、boolean、null
- 对部分 raw cell 设置 cell type override，让该列形成混合 resolved type

## When

- 设置 SortLayer spec 为升序
- 再切换为降序

## Then

- 升序按 `number/date < text < boolean < empty` 排列
- 降序反转非空类型顺序，但 empty 仍在末尾
- date 与 number 同 rank，按 serial/number 数值比较
- 类型内相等时保持稳定 row index tie-break
