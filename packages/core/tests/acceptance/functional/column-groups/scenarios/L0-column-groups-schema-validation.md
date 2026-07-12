---
id: core.L0.column-groups-schema-validation
layer: L0
summary: Schema.columnGroups 三条校验违例 throw，合法混排（组 + 无组列）通过
tags: [column-groups, schema]
status: implemented
---

## User Story

作为 Core 集成方，我希望非法的列组配置在构造/`setData` 时立即 throw（开发期 fail loud），而不是渲染出错误的组头；合法的组与无组列混排应正常通过。

## Given

- `fields`: `[m, s1c1, s1c2, s2c1, s2c2]`（5 列）
- 合法 `columnGroups`: `[{ fieldId: 'm' }, { id: 's1', label: '堆1', children: [s1c1, s1c2] }, { id: 's2', label: '堆2', children: [s2c1, s2c2] }]`

## When

- 分别用以下配置构造 DataSource 并挂载 Grid：
  1. 合法混排配置（上述）
  2. 不连续：组 `s1` 引用 `[s1c1, s2c2]`（在 `fields` 中不相邻）
  3. 叶序不一致：组 `s1` children 写成 `[s1c2, s1c1]`（与 `fields` 顺序相反）
  4. 引用不存在的 `fieldId: 'ghost'`
  5. 同一 `fieldId` 归属两条叶路径
  6. 组 `children` 为空数组
  7. 两个组使用相同 `id`

## Then

- 配置 1 构造成功，`getColumnGroups()` 返回等价组树
- 配置 2–7 各自在构造/`setData` 时 throw，错误信息指明违反的规则
- 省略 `columnGroups` 时行为与现状完全一致（`getFrame().columnGroupHeader` 为 undefined，表头总高 = `headerHeight`）
