# NovaSheet Phase 4.5 — 行结构操作 + 行头菜单

- **Date**: 2026-05-23
- **Status**: Brainstorm（待评审）
- **Scope**: 行 insert / delete / hide / unhide / 多行高度 resize + 行头右键菜单 + Sheets 式 hide 三角指示器 + 全部进 undo/redo
- **Out of scope（明确推迟）**：
  - 列 insert / delete / hide → Phase 4.6
  - 列拖拽重排 + 列头 DOM overlay 命中层 → Phase 4.7
  - 行拖拽重排 → 暂不列入路线图
  - 非连续多选 row range（Ctrl+点） → Phase 5 SelectionModel 演进时再考虑
  - "Show all hidden rows" 一键项 → 不收入，消费者自行 `Grid.unhideRows(allHiddenIds)`
  - 持久化 hidden / row heights 到 storage → 消费者用 `onHideChange` / `onRowResize` 自管
  - Sheets「Insert duplicate of selected row」 → Phase 5+ 评估
  - 稳定 row key (`updateCellByRowKey`) → LIFO 撤销栈下不需要；Phase 6+ 协同 / 多视图时再评估
  - 服务端结构变更协议 → Phase 8

---

## 1. Problem

Phase 4.4 上线了 view 层（sort / filter）。下一个自然的扩展是 **结构操作**——用户期待能在表格里插入空白行、删除行、隐藏行；这是 Excel / Sheets 用户的肌肉记忆。

行 vs 列的实现差异非常大：

- 行 hide → 进 ViewPipeline（与 sort / filter 链式组合）
- 列 hide → 不进 ViewPipeline（列不被 view 重排），改在 engine / schema overlay
- 行 insert/delete → 改 `MutableDataSource.rows`
- 列 insert/delete → 改 `Schema.fields`（schema mutation，不是 row mutation）
- 行头右键菜单 → 全新菜单容器（4.4 前行号列无菜单）
- 列头右键菜单 → 4.4 已落地 sort/filter 项，4.6 在同一菜单加项

因此把行先单独做。本 spec 即 4.5 = 行向；列向 = 4.6；列拖拽 = 4.7。

拆分原则：**结构变更走底层语义；ViewPipeline 自动重算。**Sort/Filter 激活时插入/删除照样可点，view 在 `rowsChanged` 后自行 rebuild，UX 与 Sheets 一致（用户接受插入的空白行可能在 sort 下不在视觉预期位置）。

---

## 2. Goals（4.5）

1. 行头（行号列）右键菜单：Insert above / Insert below / Delete / Hide / Unhide rows in selection / Resize row height…，N 选中插 N 行。
2. 隐藏区间的可视化：在两侧可见行的分隔线上画 Sheets 式三角指示器，DOM handle 接管点击 unhide。
3. Resize row height 菜单项弹一个 DOM 弹层（input + Enter / Esc / 失焦），多行批量。
4. 行 insert / delete / hide / unhide / 多行 resize 全部进 undo/redo（4 个新 UndoCommand variant + 扩展 `row-resize`）。
5. ViewPipeline 链中插入新一层 `HideRowsLayer`，与 SortLayer / FilterLayer 对称（symmetry with 4.4）。
6. `MutableDataSource` 增 `insertRows` / `deleteRows` 两个 optional 方法；index-based，不引入稳定 row key。
7. 结构变更后 selection / fillRange / clipboard 做坐标 remap，三类对象共享统一 remap 函数。
8. 配套 README / 4.4 spec / context-menu spec / CLAUDE.md 联动改动（本 spec 同笔交付，避免再失忆）。

---

## 3. Non-Goals（4.5）

- 列向所有结构操作（→ 4.6）
- 列拖拽重排（→ 4.7）
- 行拖拽重排
- 不连续 multi-range selection
- "Show all" 一键 unhide / 撤销栈穿越 setData
- 稳定 row key / row id
- 服务端 mutation 协议

---

## 4. UX

### 4.1 行头右键菜单（按出现顺序）

| 菜单项 | 触发底层动作 | enable 条件 | Localized label (zh / en) |
| --- | --- | --- | --- |
| Insert N row(s) above | `insertRows(at = minSelected, count = N)` | selection ≥ 1 行 | 在上方插入 N 行 / Insert N row(s) above |
| Insert N row(s) below | `insertRows(at = maxSelected + 1, count = N)` | 同上 | 在下方插入 N 行 / Insert N row(s) below |
| ─── separator ─── | | | |
| Delete N row(s) | `deleteRows(rowIds[])`（rowIds = selection 内每行的 underlying id） | selection ≥ 1 行 | 删除 N 行 / Delete N row(s) |
| Hide N row(s) | `hideRows(rowIds[])` | selection ≥ 1 行且非全部已隐藏 | 隐藏 N 行 / Hide N row(s) |
| Unhide rows in selection | `unhideRows(rowIdsInGap[])` | 选区跨越至少 1 个 hidden 区间 | 显示选区内隐藏行 / Unhide rows |
| ─── separator ─── | | | |
| Resize row height… | 弹层 → `setRowHeights(rowIds[], px)` | selection ≥ 1 行 | 调整行高… / Resize row height… |

- `N = selection.range.rowCount`；label 动态拼数字，不做时态变形。
- 多选不连续（Ctrl+点）在 4.5 范围内不支持；selection 始终是单矩形。

### 4.2 触发与状态机

| 事件 | 命中 | 行为 |
| --- | --- | --- |
| `contextmenu` | 行号列 | `preventDefault`；按 §4.3 更新 selection；菜单在 pointer 处打开 |
| `contextmenu` | resize handle / hide-toggle handle | handle 内 `stopPropagation`，两类菜单都不弹 |
| `contextmenu` | 行号列 + cell 编辑中 | 先 commit 编辑（同 blur 路径），再开菜单（与 4.0 一致） |
| `contextmenu` | drag-select / resize-drag 进行中 | `preventDefault`，不开 |
| `Shift+F10` 焦点在行号 | — | 预留 `Grid.openRowHeaderContextMenuAt(rowIndex)`，4.5 实现 |

### 4.3 行头菜单与 selection 的交互

| 当前 selection | 右键命中 | 行为 |
| --- | --- | --- |
| 单格 / cell range | range 内的行号 | 保留 selection，菜单上下文 = 整行 range |
| 单格 / cell range | range 外的行号 | `selectRow(rowIndex)`（把整行选中），menu 上下文 = 该行 |
| 行 range（4.5 起选行号即选整行） | range 内的行号 | 保留行 range |
| 行 range | range 外的行号 | 改选新行 |

4.5 起，**点击行号列等价于选中整行**（同 Sheets / Excel）。这是为了让多行菜单项 N 取值直观。`SelectionModel` 不引入新模式：把行选转译为 `range = { startCol: 0, endCol: schema.fields.length - 1, startRow, endRow }`。

### 4.4 Hide 边界三角指示器

- 在隐藏区间**上下两个可见行**的分隔线上画一对小三角（向上 / 向下）。
- 行号列宽 ≥ 24px 时绘制；否则省略，保留菜单 unhide 路径。
- 点击三角 → `unhideRows(rowIdsInGap)`；hit-zone 走 DOM `<handle-layer>` sibling（ADR §A.6），与 resize handle 同机制。
- 键盘不绑这条入口（已有菜单路径）。
- 主题 token 新增：`theme.icons.hideBoundaryUp` / `hideBoundaryDown`（SVG path）+ `theme.colors.hideIndicator`（默认取 `colors.headerIcon`）+ `theme.dimensions.hideTriangleOffset` + `hideTrianglePadX`。

### 4.5 Resize row height 弹层

- DOM popover，portal 到 body（复用 4.0 ContextMenuLayer / 4.4 FilterPopover 的 portal root）。
- 单个 `<input type="number" min="20" step="1">` + 当前值预填 + Enter 提交 / Esc 取消 / 失焦关闭。
- 提交一次写一条 undo（沿用 4.2 `row-resize` UndoCommand，本 spec 扩成多行）。
- ARIA：`role="dialog" aria-modal="true"` + label «调整行高 / Resize row height»；input 打开时聚焦 + select all；关闭后焦点回触发它的 menu item（4.0 关闭后焦点恢复契约）。

### 4.6 ARIA / 键盘

- 行头 menu 复用 4.0 ContextMenuLayer 容器：`role="menu"` + Esc 关闭 + ↑↓/Home/End/Enter + Tab 离开。
- 触发：右键 / Shift+F10 / 触屏长按（4.0 已覆盖路径，4.5 在行号 hit-test 上接入）。

### 4.7 与其它交互的关系

- Sort/Filter 激活下菜单项全部可用。引擎不试图把插入位置「翻译」回视觉预期。
- 编辑器活动期：右键打开 menu 前先 commit/cancel 编辑，与 4.0 / 4.4 行为一致。
- 列宽 drag resize（3.4）与本 spec 不交叉；行高 drag resize 仍单行，菜单弹层走多行批量。
- 4.3 Fill handle 在结构变更时按 §6.3 remap；source / destination 任一全删则 fillRange 清空。

---

## 5. ViewPipeline 扩展：HideRowsLayer

### 5.1 类型签名

```ts
// packages/core/src/view/HideRowsLayer.ts
export class HideRowsLayer implements ViewLayer {
  readonly kind = 'hide-rows';

  setHidden(underlyingRowIds: readonly number[]): void;
  addHidden(underlyingRowIds: readonly number[]): void;
  removeHidden(underlyingRowIds: readonly number[]): void;
  getHiddenUnderlyingRows(): ReadonlySet<number>;
  getCollapsedGaps(): readonly CollapsedGap[];

  wrap(upstream: DataSource): DataSource;
  onChange(listener: () => void): () => void;
}

export interface CollapsedGap {
  readonly atViewRow: number;     // 上邻可见 view-row index
  readonly hiddenCount: number;   // 区间内被隐藏的 underlying 行数
  readonly hiddenIds: readonly number[];
}
```

### 5.2 wrap 实现

- `wrap(upstream)` 返回的虚拟 DataSource 维护映射 `visibleRows: number[]`（仅可见 underlying row id 升序）。
- `getRowCount = visibleRows.length`。
- `getCell(viewRow, col) → upstream.getCell(visibleRows[viewRow], col)`。
- `getRows(start, end /* inclusive */) → upstream.getRows()` 按映射分段拼接；endIndex 仍 inclusive（ADR §A.4）。
- `resolveUnderlyingRow(viewRow) → visibleRows[viewRow]`。
- upstream `rowsChanged` 触发时：
  - `kind = 'rows-inserted'` → 平移 `hiddenUnderlyingRows`（≥ at 的全部 +count），重建 `visibleRows`。
  - `kind = 'rows-deleted'` → 从 `hiddenUnderlyingRows` 剔除被删 id；其余 id 紧缩（按删除 id 数压平），重建 `visibleRows`。
  - `kind = 'cells-changed'` → 不动 hidden 集合，不重建 `visibleRows`。
  - `kind = 'reset'` → 清空 `hiddenUnderlyingRows`，重建。

### 5.3 ViewPipeline 组合顺序

```
upstream raw DataSource
   → SortLayer.wrap            // 4.4，按 underlying 重排成 view-rows
   → FilterLayer.wrap          // 4.4，丢弃不匹配 underlying
   → HideRowsLayer.wrap        // 4.5，丢弃显式隐藏 underlying
   → engine 看到的 view DataSource
```

理由：Hide 是「最终视图过滤」，逻辑上应在 Sort + Filter 之后；Sort/Filter 不感知 Hide。`resolveUnderlyingRow` 链式 fold 是 4.4 既有 pipeline 路径，无新机制。

### 5.4 getCollapsedGaps

返回连续 hidden underlying 区间在 **view 坐标** 上的位置（用于绘制三角指示器）：

```
underlying [0..9]，hidden = {3, 4, 5}
visibleRows = [0, 1, 2, 6, 7, 8, 9]
collapsedGaps = [{ atViewRow: 2, hiddenCount: 3, hiddenIds: [3,4,5] }]
```

`Canvas2DRenderer` 通过 `engine.getFrame()` 拿到 `RenderFrame.collapsedRowGaps`（仅可见区裁剪后），HeaderRowPainter 按行边界 Y 坐标画三角。

### 5.5 生命周期与公共 API

- HideRowsLayer 由 `Grid` 持有；`Grid.destroy()` 释放（与 SortLayer / FilterLayer 一致）。
- `Grid.setData(dataSource)` 清空 hidden 集合（与 4.2 setData 清栈对称）。
- 不暴露 `Grid.getHiddenRows()`；消费者要持久化用 `onHideChange` 事件 + `Grid.hideRows / unhideRows` 复原（与 SortLayer 风格一致）。
- `Grid.hideRows(ids)` / `unhideRows(ids)` 公共方法转发到 layer，并 push UndoCommand。

### 5.6 性能

- `visibleRows` 在 100k underlying / 1k hidden 下重建 O(N)。hide/unhide 频次低，单帧 RAF 内完成可接受。
- 不引入二级 prefix-sum——行高仍由 ChunkedAxis 管，HideRowsLayer 只影响行数。
- `ChunkedAxis.setRowCount(view rowCount)` 在 `rowsChanged` 时由 engine 既有路径触发，不新增 RAF 源（ADR §A.7 不变）。

---

## 6. DataSource 契约演进

### 6.1 MutableDataSource 新增 2 个 optional 方法

```ts
// packages/core/src/data/DataSource.ts
export interface MutableDataSource extends DataSource {
  updateCellByUnderlyingRow?(rowId: number, colId: string, value: CellValue): void;  // 4.4 既有

  /** 在 underlying rowId 位置之前插入 count 行空白行。返回新插入行的 underlying rowId 列表（升序）。*/
  insertRows?(beforeUnderlyingRow: number, count: number): readonly number[];

  /** 删除给定 underlying rowId 集合，返回被删行的快照供 undo 还原。*/
  deleteRows?(underlyingRowIds: readonly number[]): readonly DeletedRowSnapshot[];
}

export interface DeletedRowSnapshot {
  readonly originalUnderlyingRow: number;
  readonly cells: Readonly<Record<string, CellValue>>;   // 含 schema 外的 extra 字段
}
```

两者均 optional：未实现时 menu 中相应项 disabled。`InMemoryDataSource`（既有）必须实现。

### 6.2 underlying rowId 语义

- 沿用 4.4 既定：`underlying row index` ≡ MutableDataSource 数组下标，序号在 mutation 时整体收缩 / 扩张。
- 不引入稳定 row key。Undo LIFO 保证 index 在 unapply 时仍正确（4.2 spec §3 既有论证）。
- `underlyingRowIds[]` 入参一律要求升序、去重；debug 模式 `assert` 校验，release 信任调用方。

### 6.3 insertRows 行为

- 在 underlying 行 R 之前插入 N 行 → 新行 underlying id 为 `[R, R+1, …, R+N-1]`，原 `R, R+1, …` 整体右移 N。
- 新行字段值取 `schema.fields[i].defaultValue`（已有契约）；未定义 default 的字段取 `undefined`。
- 触发 `rowsChanged({ kind: 'rows-inserted', at: R, count: N })`。

### 6.4 deleteRows 行为

- 入参 `[r1, r2, …]`（升序）。先 snapshot 每行所有字段（含 schema 外 extra）。
- 物理删除后剩余 id 紧缩。
- 触发 `rowsChanged({ kind: 'rows-deleted', removed: rowIds })`。
- snapshot 用于 undo（§7）。

### 6.5 rowsChanged 事件演进

```ts
export type RowsChangedReason =
  | { kind: 'rows-inserted'; at: number; count: number }     // 4.5 新
  | { kind: 'rows-deleted'; removed: readonly number[] }     // 4.5 新
  | { kind: 'cells-changed'; rows?: readonly number[] }       // 4.4 既有
  | { kind: 'reset' };                                         // setData
```

ViewLayer 按 reason 选最小重建路径（§5.2）。Renderer 仅关心总行数变化 → ChunkedAxis 重建仍走 4.4 既有 path。

### 6.6 ADR §A.4 修订

新增 2 个 optional 方法不破坏 ADR §A.4「endIndex INCLUSIVE」契约：

> ADR §A.4：`MutableDataSource` 再增两个 optional 方法（`insertRows` / `deleteRows`），与 4.4 `updateCellByUnderlyingRow` 同款 evolution；`endIndex` inclusive 不变。

---

## 7. Engine API + 坐标 remap

### 7.1 DefaultGridEngine 新增公共方法

```ts
// packages/core/src/engine/DefaultGridEngine.ts
insertRows(beforeUnderlyingRow: number, count: number): readonly number[];
deleteRows(underlyingRowIds: readonly number[]): readonly DeletedRowSnapshot[];
hideRows(underlyingRowIds: readonly number[]): void;
unhideRows(underlyingRowIds: readonly number[]): void;
setRowHeights(underlyingRowIds: readonly number[], heightPx: number): void;
```

`Grid` facade 转发同名方法。**全部入参 underlying 坐标**；UI 调用方先用 `Grid.resolveUnderlyingRow(viewRow)` 翻译。

### 7.2 一次 mutation 的内部序列（以 insertRows 为例）

1. Engine 调 `mutableDataSource.insertRows(R, N)` → `newIds`。
2. Engine 触发 `rowsChanged({ kind: 'rows-inserted', at: R, count: N })` → ViewPipeline 重建 visibleRows。
3. Engine 调 `remapAfterInsert(R, N)` → Selection / FillRange / Clipboard 平移（§7.3）。
4. Engine 调 `axisRow.insertRange(R, N, defaultRowHeight)`（ChunkedAxis 新方法 §7.4）。
5. Engine push `'rows-insert'` UndoCommand（§8）。
6. Engine `invalidate()` → 下一帧 Renderer 重绘。

`deleteRows / hideRows / unhideRows / setRowHeights` 同构，差异在 step 1 / 3 / 4 / 5 的具体动作。

### 7.3 Selection / FillRange / Clipboard remap 协议

`packages/core/src/coords/remap.ts`：

```ts
remapRowIndexAfterInsert(rowIndex: number, at: number, count: number): number;
remapRowIndexAfterDelete(rowIndex: number, removedSorted: readonly number[]): number | null;
// null = 行被删
```

| 持有 underlying 行坐标的对象 | insert 后 | delete 后 |
| --- | --- | --- |
| `SelectionModel`（anchor / active / range） | 全平移 | range 折叠到「删后离 anchor 最近的存活行」；全删空则 `clear()` |
| `FillRange`（4.3） | 全平移 | 同 SelectionModel；source / destination 任一全删 → 整 FillRange 置 null |
| `ClipboardSnapshot`（4.1 内部 row id 列表） | 平移 | 被删 id 从列表中剔；hash 保留以便 paste 时跳过命中已删行 |

Hide / Unhide 不走 remap：underlying id 不变；SelectionModel 内部「view ↔ underlying」转换走 4.4 既有路径。

### 7.4 ChunkedAxis 扩 2 个 mutation 方法

```ts
// packages/core/src/layout/ChunkedAxis.ts
insertRange(beforeIndex: number, count: number, defaultSize: number): void;
deleteRange(removedSortedIndices: readonly number[]): void;
```

实现要点：
- 复用既有 `sizes: Float64Array` + `chunkPrefixSum: Float64Array` 的 rebuild 路径；增删后调用 private `rebuild()`，O(count / CHUNK_SIZE) 重算 prefixSum。
- `getSize(i)` 语义不变（ADR §A.7 规则不变）。

### 7.5 事件外抛

`Grid` 新增三个事件（与 4.4 风格一致）：

- `onRowsInserted(e: { at: number; count: number; newIds: readonly number[] })`
- `onRowsDeleted(e: { removed: readonly DeletedRowSnapshot[] })`
- `onHideChange(e: { hidden: readonly number[] })`

`onRowResize` 沿用 4.2 名称但 payload 扩成 `rowIds: readonly number[]` + `heightPx`（向后兼容：单行 resize 走单 id 数组）。

---

## 8. UndoCommand 扩展

### 8.1 新增 4 个 variant

```ts
// packages/core/src/undo/UndoCommand.ts
export type UndoCommand =
  | CellEditCommand
  | CutCommand
  | PasteCommand
  | RowResizeCommand           // 4.2，本阶段扩为多行
  | ColResizeCommand
  | FillCommand
  | RowsInsertCommand          // 4.5
  | RowsDeleteCommand          // 4.5
  | RowsHideCommand            // 4.5
  | RowsUnhideCommand;         // 4.5

interface RowsInsertCommand {
  kind: 'rows-insert';
  at: number;
  count: number;
  newIds: readonly number[];
  selectionBefore: SelectionSnapshot;
  selectionAfter: SelectionSnapshot;
}

interface RowsDeleteCommand {
  kind: 'rows-delete';
  snapshots: readonly DeletedRowSnapshot[];
  selectionBefore: SelectionSnapshot;
  selectionAfter: SelectionSnapshot;
}

interface RowsHideCommand {
  kind: 'rows-hide';
  underlyingRowIds: readonly number[];   // 本次新增 hidden 的部分
  selectionBefore: SelectionSnapshot;
  selectionAfter: SelectionSnapshot;
}

interface RowsUnhideCommand {
  kind: 'rows-unhide';
  underlyingRowIds: readonly number[];   // 本次新增 visible 的部分
  selectionBefore: SelectionSnapshot;
  selectionAfter: SelectionSnapshot;
}

interface RowResizeCommand {            // 4.2 扩展
  kind: 'row-resize';
  rowIds: readonly number[];
  oldHeights: readonly number[];        // 与 rowIds 同长
  newHeight: number;
  selectionBefore: SelectionSnapshot;
  selectionAfter: SelectionSnapshot;
}
```

### 8.2 apply / unapply 对称

| Command | apply（redo） | unapply（undo） |
| --- | --- | --- |
| `rows-insert` | `insertRows(at, count)`；首次 apply 时回填 `newIds` | `deleteRows([at .. at + count - 1])` |
| `rows-delete` | `deleteRows(snapshots.map(s => s.originalUnderlyingRow))` | `insertRows(snapshots[0].original, snapshots.length)` + 用 snapshot 全字段回填 |
| `rows-hide` | `hideRowsLayer.addHidden(ids)` | `hideRowsLayer.removeHidden(ids)` |
| `rows-unhide` | `hideRowsLayer.removeHidden(ids)` | `hideRowsLayer.addHidden(ids)` |
| `row-resize`（多行） | `setRowHeights(rowIds, newHeight)` | `setRowHeights(rowIds[i], oldHeights[i])` 批量逐个还原 |

### 8.3 与 ViewPipeline 的交互

- `rows-insert / rows-delete` 走 MutableDataSource → `rowsChanged` → ViewPipeline 自动重算；undo 路径对称。
- `rows-hide / rows-unhide` 走 HideRowsLayer → 仅触发 layer onChange，不动 underlying；selection remap 与 §7.3 一致。
- 撤销结构变更后若 Sort/Filter 激活，view 可能让选区显得「跳了一下」——是 Sheets 既有体验，不试图修正。

### 8.4 栈深度与合并

- 不合并任何结构命令（与 4.2 `'cell-edit'` 之外的命令一致）。
- 沿用 4.2 `UndoStack(depth = 100)`。

### 8.5 setData 清栈

沿用 4.2 ADR：`Grid.setData(...)` 清空 UndoStack + 清 HideRowsLayer，与 4.4 sort/filter 一致。

---

## 9. Renderer / Painter 改动

### 9.1 受影响文件

| 文件 | 改动 |
| --- | --- |
| `packages/web-canvas2d/src/painters/HeaderRowPainter.ts` | 既有行号列绘制路径补一段：消费 `frame.collapsedRowGaps`，在每个 gap 的 view-row 下边界 Y 处画一对三角 |
| `packages/web-canvas2d/src/render/Canvas2DRenderer.ts` | 不改；只是新增字段透传 |
| `packages/core/src/render/RenderFrame.ts` | 新增 `collapsedRowGaps: readonly CollapsedGap[]` 字段 |
| `packages/core/src/engine/DefaultGridEngine.ts` | `getFrame()` 输出按可见区裁剪后透传 collapsedRowGaps |
| `packages/core/src/theme/denseGridTheme.ts` | 新增 `icons.hideBoundaryUp` / `hideBoundaryDown` + `colors.hideIndicator` + `dimensions.hideTriangleOffset` / `hideTrianglePadX` |

### 9.2 RenderFrame 字段增量

```ts
export interface CollapsedGap {
  readonly atViewRow: number;
  readonly hiddenCount: number;
  readonly hiddenIds: readonly number[];
  readonly yPx: number;             // view-row 下边界在 canvas 上的 Y（已扣 scrollTop；DPR 由 Renderer 负责）
}

export interface RenderFrame {
  // ... 既有
  readonly collapsedRowGaps: readonly CollapsedGap[];
}
```

### 9.3 三角绘制规则

- 仅在 `frame.headers.rowHeaderWidth ≥ 24px` 时绘制。
- 两个三角分别绘制于 `yPx - dimensions.hideTriangleOffset` 与 `yPx + dimensions.hideTriangleOffset`（默认 4px）。
- 颜色 `theme.colors.hideIndicator`；尺寸 `8 × 6 px`（同新 token）。
- 三角是装饰；**不在 canvas 上接收点击**——命中走 §9.4。

### 9.4 DOM handle 层（ADR §A.6 复用）

`packages/web/src/host/DomGridHost.ts` 既有 `<handle-layer>` 子树新增 `data-handle="hide-toggle"` 节点：

- 每个 gap 渲染一个 16 × 16px 透明命中区，绝对定位于行号列 + Y 边界。
- pointerdown → `Grid.unhideRows(gap.hiddenIds)`。
- 键盘不绑（菜单已覆盖）。

### 9.5 Resize 弹层

新增 `packages/web/src/overlay/RowHeightPopover.ts`（与 4.4 `FilterPopover` 同目录、同 portal 机制）：

- 复用 4.0 / 4.4 portal container。
- `open(triggerRect, currentHeight)` / `close()` 自管 lifecycle。
- 提交时调用 `Grid.setRowHeights(ids, px)`；Grid 自行 push undo。

### 9.6 Theme tokens 增量

```ts
icons: {
  // ... 既有
  hideBoundaryUp:   'M0 6 L4 0 L8 6 Z',
  hideBoundaryDown: 'M0 0 L4 6 L8 0 Z',
},
colors: {
  // ... 既有
  hideIndicator: '#6b7280',
},
dimensions: {
  // ... 既有
  hideTriangleOffset: 4,
  hideTrianglePadX: 6,
},
```

零硬编码视觉值（ADR §A.5）。

---

## 10. 测试与 Storybook

### 10.1 测试矩阵

| 文件 | 覆盖范围 |
| --- | --- |
| `packages/core/tests/view/HideRowsLayer.test.ts` | wrap 后 `getRowCount` / `getCell` / `resolveUnderlyingRow` / `getCollapsedGaps`；hidden 集合在 upstream insert / delete 后正确平移；与 SortLayer + FilterLayer 组合 |
| `packages/core/tests/data/InMemoryDataSource.test.ts` | `insertRows` 返回升序新 id + 触发 `rowsChanged({kind:'rows-inserted'})`；`deleteRows` snapshot 含全字段；rowCount 收缩；schema 缺 default → 新行字段 = undefined |
| `packages/core/tests/coords/remap.test.ts` | `remapRowIndexAfterInsert` / `remapRowIndexAfterDelete` 在四种相对位置（before / inside / at / after）下的输出，含 null（整 range 被删） |
| `packages/core/tests/engine/DefaultGridEngine.row-mutations.test.ts` | `insertRows / deleteRows / hideRows / unhideRows / setRowHeights(batch)` 串联：MutableDataSource + ViewPipeline + ChunkedAxis + Selection + UndoStack 全联动；Sort/Filter 激活下的 view 自动重算 |
| `packages/core/tests/layout/ChunkedAxis.mutations.test.ts` | `insertRange` / `deleteRange` 后 `getSize` / `indexToPosition` 在 chunk 边界、count - 1、跨 chunk 的正确性 |
| `packages/core/tests/undo/UndoStack.row-mutations.test.ts` | 4 个新 variant 的 apply / unapply 对称；redo 后状态等价；混合 cell-edit + rows-insert + fill 后 LIFO 一致；setData 清栈 |
| `packages/web-canvas2d/tests/painters/HeaderRowPainter.hide.test.ts` | 给定 RenderFrame.collapsedRowGaps，RecordingContext2D 记录三角 path / fill 次数与坐标；行号列宽 < 24px 时跳过 |
| `packages/web/tests/Grid.row-menu.test.ts` | 行头右键 → menu 出现 Insert above/below / Delete / Hide / Unhide / Resize；Sort 激活时 Insert 仍可点；happy-dom + RecordingContext |
| `packages/web/tests/overlay/RowHeightPopover.test.ts` | open / Enter 提交 / Esc 取消 / 失焦关闭 / 焦点恢复到原 menu item |
| `packages/web/tests/handle/HideToggleHandle.test.ts` | gap handle 点击触发 `Grid.unhideRows(idsInGap)`；多 gap 各自独立 |
| `packages/web/tests/integration/Phase45.scenarios.test.ts` | E2E：N 行选区 → Insert above N → undo → cells & selection 完全还原；Sort 激活下 delete → ViewPipeline 自动 rebuild；Hide + Unhide via 三角 handle |

### 10.2 TDD 节奏

每个文件先写 failing 测试 → `bun test` 见 RED → 写实现 → GREEN → commit（一 task 一 commit，遵循 CLAUDE.md「Testing conventions」+「Commit conventions」）。

类型-only 失败（DataSource interface 新增 optional 方法）用 `bun run --filter '*' typecheck` 验 RED → 实现后 GREEN，与 4.4 一致。

### 10.3 Storybook stories

新增 `apps/storybook/src/stories/RowStructural.stories.ts`：

- **default**：5 字段（text + number + date + multiSelect + checkbox）× 200 行；纯结构操作（右键 / 三角 handle）。
- **with-view**：预激活 SortLayer + FilterLayer，演示 view 下结构操作的语义。
- **prefilled-hidden**：含若干 hidden 区间，演示三角 indicator + Unhide via handle / Unhide via menu。

### 10.4 性能用例

- 100k 行 InMemory，`hideRows([1..1000])` → 单次 RAF 完成（HideRowsLayer.wrap 重建 visibleRows ≤ 16ms）。
- 100k 行 + 激活 Sort + 激活 Filter，`deleteRows([1..100])` → ViewPipeline 全链重算 ≤ 50ms。
- 不引入新基准 harness（复用 4.4 既有手动跑路径）。

---

## 11. ADR 影响 + Out of Scope + 跨文档对齐

### 11.1 ADR 影响表

| ADR | 是否影响 | 说明 |
| --- | --- | --- |
| §A.1 单 Canvas 全可见区重绘 | 不影响 | HeaderRowPainter 多绘两组三角，仍在单 canvas 内 |
| §A.2 原生滚动 + 非线性 scrollTop | 不影响 | rowsChanged 时 ScrollMapper 重算 spacer，4.2 既有路径 |
| §A.3 ChunkedAxis CHUNK_SIZE = 1024 | 不影响 | 新增 `insertRange` / `deleteRange` 复用既有 rebuild |
| §A.4 DataSource endIndex INCLUSIVE | **小幅修订** | `MutableDataSource` 增 2 个 optional 方法（`insertRows` / `deleteRows`），endIndex 语义不变 |
| §A.5 Theme 唯一视觉源 | 不影响 | 新增 `icons.hideBoundary*` + `colors.hideIndicator` + 2 个 dimensions token |
| §A.6 DOM `<handle-layer>` siblings | 不影响 | 新增 `data-handle="hide-toggle"` 节点，与 resize handle 同机制 |
| §A.7 Per-Grid FrameScheduler | 不影响 | 不引入新 RAF 源；HideRowsLayer.wrap 同步执行 |

### 11.2 Out of Scope（显式 anchor）

| 项 | 状态 | 后续 phase |
| --- | --- | --- |
| 列 insert / delete / hide | 不交付 | Phase 4.6 |
| 列拖拽重排 + 列头 DOM overlay 层 | 不交付 | Phase 4.7 |
| 行拖拽重排 | 不交付 | 暂不入路线图 |
| 非连续多选 row range（Ctrl+点） | 不交付 | Phase 5 SelectionModel 演进时考虑 |
| Show all hidden rows 一键项 | 不交付 | 不入路线图；消费者自行 `unhideRows(allHiddenIds)` |
| 持久化 hidden / row heights 到 storage | 不交付 | 消费者用 `onHideChange` / `onRowResize` 自管 |
| Insert with duplicate selected row（Sheets 行为） | 不交付 | Phase 5+ 评估 |
| 稳定 row key (`updateCellByRowKey`) | 不交付 | LIFO 撤销栈下不需要；Phase 6+ 协同 / 多视图时再评估 |
| 服务端结构变更协议 | 不交付 | Phase 8 |

### 11.3 跨文档对齐（本 spec 同笔提交）

下列改动与本 spec 同一笔 commit 提交，避免再失忆：

| 文档 | 改动 |
| --- | --- |
| `README.md` | 整体重构：移除分散在 L24-39 / L43-46 / L216-230 / L242-252 / L254-270 / L281-286 的 4 套重复 phase 表，合成唯一里程碑总表；Phase 4.5 / 4.6 / 4.7 分别成行；保留 Quick Start / 键盘速查 / resize 速查 / 架构图 / 仓库结构 / 开发脚本 |
| `docs/superpowers/specs/2026-05-22-sort-filter-design.md` L31 | `4.5 后再开放` → `Phase 5+ 再评估` |
| 同上 L33 / L799 | `Phase 4.5 列拖拽重排时引入` → `Phase 4.7 列拖拽重排时引入` |
| 同上 L807 | 行 insert/delete 改成「继续 index-based + LIFO；row key 留待 Phase 6+ 评估」 |
| `docs/superpowers/specs/2026-05-17-context-menu-design.md` L7 / L35 / L50 | 拆「列头 sort/filter → 4.4 已接管 · 行头 → 4.5 · 列头结构项 → 4.6」 |
| 同上 L38 | 「多级 / 子菜单」改为 4.5 / 4.6 不引入；Phase 5+ 再评估 |
| 同上 L39 | 「排序/筛选/插入/删除菜单项」拆为 4.4 / 4.5 / 4.6 三栏 |
| 同上 L226 | menuItemHover「为 4.5 column-header 风格扩展」改为「为 4.5 行头 / 4.6 列头扩展」 |
| 同上 L296 | OQ2「4.5 配合命令注册一起设计」改为「Phase 5+ 配合命令注册一起设计」 |
| 同上 L319 self-review | 「头区菜单显式归 4.5」改为「列头 sort/filter 归 4.4 · 行头归 4.5 · 列头结构项归 4.6」 |
| `CLAUDE.md` Current state | `Last shipped` 改为 Phase 4.4；`Next milestone` 改为 Phase 4.5 + 引用本 spec；`Phase 4 status` 改为「4.5 设计中；4.6 / 4.7 后续」 |

---

## 12. Invariants（4.5 强制）

1. 所有 mutation 入参一律 **underlying** 坐标；view → underlying 翻译由 UI 调用方在 Grid facade 边缘完成。
2. `HideRowsLayer.wrap` 在 ViewPipeline 内顺序固定：`Sort → Filter → Hide`，与组合顺序耦合。
3. `MutableDataSource.insertRows` / `deleteRows` 是 optional：未实现 → 行结构菜单项 disabled；不抛错。
4. `rows-insert / rows-delete / rows-hide / rows-unhide` 4 个 UndoCommand 互不合并；LIFO 顺序下 index-based 状态自洽。
5. 三角 indicator 仅是装饰；命中走 DOM handle（ADR §A.6）；canvas 不接收三角的点击。
6. 结构变更后 Selection / FillRange / Clipboard 走统一 `remap.ts` 函数；不再各模块各自实现。
7. `setData(dataSource)` 清空 UndoStack + 清空 HideRowsLayer（与 4.4 / 4.2 setData 清栈对称）。
8. Resize 行高的 menu 路径与 drag 路径共享 4.2 `row-resize` UndoCommand variant（扩成多行）；不引入第二种 resize 命令。

---

## 13. Open Questions

| #   | 问题                                                                              | 临时决定                                                                                                  |
| --- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| OQ1 | "Insert" 在 sort 激活下视觉不预期是否需要 toast 提示？                          | 4.5 不出 toast；i18n key 留出，让消费者 onRowsInserted 自检并自定义提示                                  |
| OQ2 | Hide → 三角 indicator → unhide 的命中区是否在 ChunkedAxis 极小行高下与 resize handle 冲突？ | 4.5 强制要求 `rowHeaderWidth ≥ 24px` 才画三角；handle 层 z-index resize > hide-toggle，最小行高保留 resize 命中优先 |
| OQ3 | Resize 多行不同高度时，input 的初始值取什么？                                  | 取选区第一行高度；输入提交时所有选中行统一为新高度（Sheets 一致）                                       |
| OQ4 | `unhideRows` undo 后被 unhide 的 row 顺序是否一定回到原 hidden 状态？           | LIFO 保证：unapply 把对应 ids 重新 add 回 hidden 集合，集合无序但 visibleRows 重建按 underlying id 升序 |
| OQ5 | DataSource 实现方不提供 `insertRows` / `deleteRows` 时菜单 UI 行为？             | menu 渲染时根据 `mutableDataSource.insertRows != null` 决定 disabled；不抛 runtime 异常                  |

---

## 14. Spec self-review

- [x] 4.5 交付物明确：行 insert/delete/hide/unhide/resize 5 类 mutation + 行头菜单 + 三角 indicator + 弹层
- [x] 列向操作显式拆到 4.6 / 4.7，README + sort-filter + context-menu spec 同笔联动改动
- [x] HideRowsLayer 设计与 4.4 SortLayer / FilterLayer 对称（同款 ViewLayer 接口、同款 onChange、同款 wrap）
- [x] MutableDataSource 新增 2 个 optional 方法，与 4.4 `updateCellByUnderlyingRow` 同款 evolution；endIndex INCLUSIVE 不变
- [x] 4 个新 UndoCommand variant + RowResize 多行扩展；apply / unapply 对称且文档化
- [x] Selection / FillRange / Clipboard 共享单一 `remap.ts`，不再各自实现
- [x] DOM handle / Resize popover 复用 4.0 / 4.4 portal 与 handle-layer 机制
- [x] Theme tokens 全部从 theme 读，零硬编码（ADR §A.5）
- [x] 测试粒度到文件 + 11 个文件涵盖 core / web-canvas2d / web / integration
- [x] Storybook 3 个 story（default / with-view / prefilled-hidden）
- [x] ADR §A.4 影响显式标注；其它 6 条 ADR 不影响
- [x] Out of Scope 5 项全部锚到具体后续 phase 或路线图状态
- [x] 跨文档对齐表列到具体行号 / 改动方向
- [x] Invariants 8 条覆盖坐标系 / 顺序 / 命中 / 撤销栈 / setData 清栈
- [x] Open Questions 5 条全部给临时决定，不留 TBD
