# Format/Merge 抽离为 DefaultFormatState 聚合根 — 设计

> Engine 重构第 7 步：format/merge **协调收口**（目录搬移已完成，本 spec 只管行为/结构收口）。

## 背景

| 现状 | 问题 |
| --- | --- |
| `DefaultGridEngine` 自持 `formatStore` + `mergeStore`（各 ~25+ 引用） | 组合根仍承担 format/merge 状态主人职责 |
| `FormatController` 已拥有 5 个正向 mutation 编排 | store 所有权与 controller 分离，engine 中间层过厚 |
| `FormatEventHandler` 经 12 个 lambda 从 engine 注入 remap | remap 面散落 engine 构造函数 |
| `FormatState.ts` 仅有 `FormatStateContext` 接口骨架 | 第 7 步未落地 |

对称参照：`DefaultLayoutState`（自持 axis/frozen/viewport）、`DefaultSelectionState`（自持选区）+
`SelectionController`（写入门面 + merge 协调）。

## 目标

1. **`DefaultFormatState` 聚合根**自持 `RangeStyleStore` + `MergeStore`。
2. **`FormatController` 只依赖 `FormatState`** 取 store（不再由 engine 传两个 store）。
3. **`FormatEventHandler` 的 remap 面**由 `DefaultFormatState` 实现（engine 不再写 12 个 lambda）。
4. **`DefaultGridEngine` 删除** `formatStore`/`mergeStore` 字段；只读 API（`getCellFormat`/`getMergeRegion`）委派聚合根。
5. **零行为变化**：1028 tests 全绿；公共 `GridEngine` API 不变。

## 非目标

- 不改 `FormatController` 的 mutation 编排语义（undo 入栈、merge 选区联动不变）。
- 不迁移 `FormatUndoHandler` / undo restore 路径（已在 M2 完成，仍经 registry）。
- 不把 `VisibleFormatResolver` / `FillStylePropagator` 并入聚合根（继续独立只读/平铺 helper，只改 store 来源）。
- 不新增 CQRS command handler / domain event（format mutation 仍不产事件）。

## 模块设计

### `FormatState` 富接口 + `DefaultFormatState`

路径：`packages/core/src/features/format/FormatState.ts`（**重写**，删除悬空 `FormatStateContext`）。

```typescript
/** format/merge 聚合根只读 + restore + 结构 remap 面（供 FormatEventHandler 消费）。 */
export interface FormatState {
  readonly formatStore: RangeStyleStore
  readonly mergeStore: MergeStore
  resolveCellFormat(rowIndex: number, colIndex: number): CellFormat | undefined
  getMergeRegionAt(rowIndex: number, colIndex: number): MergeRegion | null
  restoreFormat(layers: readonly FormatLayer[]): void
  restoreMerge(regions: readonly MergeRegion[]): void
  // — 以下与 FormatEventHandlerContext 同形，DefaultFormatState 委托 store —
  remapFormatRows(indexMap: ReadonlyMap<number, number>): void
  remapMergeRows(indexMap: ReadonlyMap<number, number>): void
  remapFormatAfterRowsInserted(at: number, count: number): void
  remapMergeAfterRowsInserted(at: number, count: number): void
  remapFormatAfterRowsDeleted(rowIds: readonly number[]): void
  remapMergeAfterRowsDeleted(rowIds: readonly number[]): void
  remapFormatCols(indexMap: ReadonlyMap<number, number>): void
  remapMergeCols(indexMap: ReadonlyMap<number, number>): void
  remapFormatAfterColsInserted(at: number, count: number): void
  remapMergeAfterColsInserted(at: number, count: number): void
  remapFormatAfterColsDeleted(colIndices: readonly number[]): void
  remapMergeAfterColsDeleted(colIndices: readonly number[]): void
}

export class DefaultFormatState implements FormatState {
  readonly formatStore = new RangeStyleStore()
  readonly mergeStore = new MergeStore()
  // 方法体 = 现有 store 调用的 1:1 委托（delete 排序规则与 engine 现 lambda 一致）
}
```

**delete 排序不变量**（从 engine 迁入时须逐字保留）：
- `remapFormatAfterRowsDeleted` / `remapMergeAfterRowsDeleted`：`[...rowIds].sort((a,b)=>a-b)`
- `remapFormatAfterColsDeleted` / `remapMergeAfterColsDeleted`：`[...idx].sort((a,b)=>a-b)`

### `FormatController` 调整

构造函数由 `(formatStore, mergeStore, ctx)` 改为 `(formatState: FormatState, ctx: FormatControllerContext)`。
内部 `this.formatState.formatStore` / `.mergeStore` 访问；**方法体不变**。

### `DefaultGridEngine` 调整后形态

```typescript
private readonly formatState = new DefaultFormatState()
private readonly formatController = new FormatController(this.formatState, {
  translateRange: (range) => this.coords.viewRangeToRaw(range),
  pushUndo: (command) => this.undoStack.push(command),
  getSelection: () => this.selection.getSelection(),
  selectRange: (range) => this.selectionController.setSelectedRange(range),
})
private readonly frameFormat = new VisibleFormatResolver(
  this.formatState.formatStore,
  this.formatState.mergeStore,
  this.coords,
)
private readonly fillStyles = new FillStylePropagator(
  this.formatState.formatStore,
  this.formatState.mergeStore,
  this.coords,
)
// eventPipeline:
new FormatEventHandler(this.formatState)
// registerFormatUndo / 结构 undo:
restoreFormat: (layers) => this.formatState.restoreFormat(layers),
restoreMerge: (regions) => this.formatState.restoreMerge(regions),
// 结构 mutation 快照：
formatBefore: this.formatState.formatStore.snapshot(), // 或 formatState 暴露 snapshot  helper
```

`getCellFormat` / `getMergeRegion` → `this.formatState.resolveCellFormat` / `getMergeRegionAt`。

结构 undo（insert/delete/move row/col）里 `formatBefore`/`mergeBefore` 快照仍走 `formatStore.snapshot()`（经 `formatState.formatStore`）。

### `FormatEventHandlerContext`

保留类型别名即可：`export type FormatEventHandlerContext = Pick<FormatState, /* remap keys */>`，
或让 `FormatEventHandler` 构造函数接受 `FormatState`（推荐后者，减 duplication）。

## 测试策略

| 层 | 文件 | 覆盖 |
| --- | --- | --- |
| 聚合根单测 | `tests/features/format/DefaultFormatState.test.ts` | store 初始、resolve、restore、至少 1 个 remap 委托 |
| 既有 | `FormatController.test.ts` 等 | 改构造注入 `DefaultFormatState`，行为不变 |
| 回归 | `DefaultGridEngine.format-merge-structural*.test.ts` | 全绿即收口验收 |

## 风险

| 风险 | 缓解 |
| --- | --- |
| engine 55 处 `this.formatStore`/`mergeStore` 漏改 | typecheck + grep 门 `DefaultGridEngine` 零命中 |
| delete remap 排序 off-by-one | 单测断言 sort 委托；对照 engine 现 lambda 逐字迁移 |
| FormatEventHandler 类型收窄 | `DefaultFormatState implements FormatState` 结构满足 handler |

## 验收

- `grep -n 'private readonly formatStore\|private readonly mergeStore' DefaultGridEngine.ts` → 空
- `FormatStateContext` 删除；`DefaultFormatState` 存在
- `engine/README.md` 第 7 步 ✅
- `bun test` 1028/0；4 包 typecheck；lint 0
