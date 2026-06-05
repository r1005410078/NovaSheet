# 交互式 merge 吸附的 view↔raw 坐标隐患

- 日期：2026-06-05
- 状态：**已实现**（方案 A）。`packages/core/src/engine/MergeViewResolver.ts` 提供
  `mergeRegionToView` / `resolveViewMergeRegion`；`VisibleFormatResolver` 复用前者，
  selectionController merge lookup 与 `beginCellEdit` 改用后者。测试
  `packages/core/tests/engine/MergeViewResolver.test.ts` 覆盖 view≠raw / 隐藏列 / 行序非连续。
- 相关：Phase 5-A merge（`2026-05-28-novasheet-phase-5-merge-range-formatting.md`）、
  selection 命令处理器（`packages/core/src/engine/selection/`）

## 背景

Phase 5-A 不变量：`MergeStore` / `RangeStyleStore` 按 **raw** 坐标键控；`getFrame()` 经
`CoordinateSpace` 把可见区 raw→view 后再交给 painter。所有 **mutation** 入口（mergeCells /
setBorders / fill 等）都先 `viewRangeToRawRange` 把 view 选区翻译为 raw 再写入。

但若干 **交互式读取** 路径绕过了这层翻译：它们拿到的是 **view 坐标**（选区/点击/导航都在
view 空间），却**直接**用 view 坐标查询 raw 键控的 `MergeStore.getRegionAt(row, col)`。

当 view == raw（无排序/筛选、无隐藏列）时一切正常——这也是现有测试与日常使用的常态，
所以问题长期不可见。一旦 sort/filter 改变行序、或隐藏列使 col 索引平移，view≠raw，
这些路径就会查错合并区甚至漏查。

## 命中点

| 位置 | 入参坐标 | 现状 | 风险 |
| --- | --- | --- | --- |
| `DefaultGridEngine` selectionCommand 的 `resolveMergeRegion`（约 L112） | view | 直接 `mergeStore.getRegionAt(viewRow, viewCol)`，返回 `region.range`（raw）当 view 用 | 键盘导航/点击吸附到错误合并区；返回的 raw range 直接塞进 view 选区 |
| `DefaultGridEngine.beginCellEdit`（约 L274） | view | 直接查 raw store，并把 `region.anchor`（raw）作为 `editCell` 喂给 `fieldAt(colIndex)` / `data.getCell(rowIndex, …)`（两者期望 view） | 双重错位：查错 + 把 raw 当 view 编辑 |

> 注：`getMergeRegion(rowIndex, colIndex)`（约 L1003）是**文档化的 raw API**
> （CLAUDE.md「`getCellFormat`/`getMergeRegion`（RAW coords）」），调用方传 raw，**不在本隐患范围**。
> fill / clipboard 的 merge 集成已走 `viewRangeToRawRange`，**已正确**。

## 正确做法（参考 `VisibleFormatResolver`）

`VisibleFormatResolver.mergeRegions` / `mergeRegionToView` 已经实现了「view 区→raw 查
`MergeStore`→单个合并区 raw→view（隐藏行列 / 行序非连续返回 null）」的完整翻译。交互式吸附
应复用同一翻译，而非直接用 view 坐标查 raw store。

建议引入一个单一的 view 空间合并解析器，供所有交互式吸附复用：

```
resolveViewMergeRegion(viewRow, viewCol): { range: CellRange /* view */, anchor: CellAddress /* view */ } | null
```

实现：
1. `viewColToRaw(viewCol)` / `viewRowToRaw(viewRow)` 得 raw cell；任一为隐藏（-1）→ 返回 null。
2. `mergeStore.getRegionAt(rawRow, rawCol)`。
3. 命中后用 `mergeRegionToView`（或抽取为 `CoordinateSpace` / 共享 helper）把 region raw→view；
   隐藏行列或行序非连续 → 返回 null（与 painter「不画半残合并」一致）。

改造点：
- selectionCommand 的 merge lookup 改用 `resolveViewMergeRegion`，返回 **view** range。
- `beginCellEdit` 改用 `resolveViewMergeRegion`，`editCell` 取返回的 **view** anchor。

## 方案对比

| 维度 | A：抽取共享 view-merge 解析器 | B：各调用点就地 view→raw→view |
| --- | --- | --- |
| 重复 | 单点，零重复 | 两处重复翻译逻辑 |
| 一致性 | 与 `VisibleFormatResolver` 同源，行为统一 | 易漂移 |
| 改动面 | 需抽取 `mergeRegionToView` 为可复用单元 | 小但散 |
| 推荐 | ✅ | — |

推荐 **A**：把 `mergeRegionToView` 的单区翻译抽成可复用单元（`VisibleFormatResolver` 与新解析器共用），
新增 `resolveViewMergeRegion` 作为交互式吸附的唯一入口。

## 验收

- 新增测试：sort/filter 激活（view≠raw）下，点击 / 方向键导航 / `beginCellEdit` 命中合并区，
  选区吸附与编辑锚点均落在**正确的 view 坐标**。
- 隐藏列 / 行序非连续时合并区按既有语义不吸附（解析器返回 null），不产生半残选区。
- 既有 view==raw 行为不回归（现有 selection / merge 测试保持绿）。

## 非目标

- 不改 `getMergeRegion` 的 raw API 契约。
- 不改 extend（Shift+方向键）的 merge 语义（仍按索引推进，见 selection README「已知限制」）。
