# NovaSheet Phase 4.6 — 列结构操作 + 列头菜单扩展

- **Date**: 2026-05-24
- **Status**: Brainstorm（待评审）
- **Scope**: 列 insert / delete / hide / unhide / 多列宽度 resize + 列头右键菜单扩展 + Sheets 式 hide 三角指示器 + 全部进 undo/redo + FrozenRegions 自动同步
- **Out of scope（明确推迟）**：
  - 列拖拽重排 + 列头 DOM overlay 命中层 → Phase 4.7
  - 新建列时字段类型选择弹层 → Phase 6（字段编辑器）
  - 字段类型变更（text → number 等） → Phase 6
  - 列复制（duplicate column with values） → Phase 5+
  - 跨列粘贴整列 → Phase 5+
  - 合并列 → Phase 5 单元格合并
  - 持久化 hidden cols / 列宽到 storage → 消费者用 `onHideColsChange` / `onColResize` / `onColumnsInserted` / `onColumnsDeleted` 自管
  - 服务端 schema 变更协议 → Phase 8
  - 非连续多选 col range → Phase 5+ SelectionModel 演进

---

## 1. Problem

Phase 4.5 落地了行结构操作。下一个自然扩展是列结构——用户期待能插入空白列、删除列、隐藏列、批量调整列宽。这是 Excel / Sheets 用户的肌肉记忆。

列与行的根本差异决定了 4.6 不能简单复制 4.5：

- 行 hide 进 ViewPipeline（与 sort/filter 链式组合）；列 hide **不进**——cols 不被 view 重排，hide 仅影响"哪些 fields 进入 frame"
- 行 insert/delete 改 `MutableDataSource.rows`（数据增删）；列 insert/delete 改 `Schema.fields`（schema mutation，是 **新协议**）
- 行头右键菜单 4.5 新增；列头菜单 4.4 sort/filter 已建容器，4.6 只需 **加菜单项**
- 行无稳定标识只有 index；列有稳定 `field.id: string`，hide 必须按 fieldId（避免 insert/delete 错位）
- FrozenRegions 仅与 col 结构互动（行结构不影响 leftCols/rightCols）

4.6 与 4.5 的 **复用比例约 50-60%**：UndoCommand 模板 / Popover 模式 / coords/remap / raw-view axis 拆分 / DOM handle 全套机制可复用；新增工作集中在 Schema mutation 协议 + FrozenRegions 自动同步 + SortLayer/FilterLayer 对 fieldId 失效的对称处理。

拆分原则：**Schema mutation 走底层语义；ViewPipeline 不感知列；FrozenRegions 自动调整**。

---

## 2. Goals（4.6）

1. 列头右键菜单扩展：在 4.4 既有 sort / filter 项之后，加 Insert N column(s) left / right · Delete N column(s) · Hide N column(s) · Unhide cols in selection · Resize column width…
2. 多选 N 列：Insert 插 N 列；Delete 删全部选中；Hide 全部选中。
3. 隐藏列边界画 Sheets 式三角指示器（列头之间），点击展开。
4. 全部结构操作支持 undo/redo；不与 4.4 ViewPipeline 冲突。
5. 列宽调整菜单弹层（ColumnWidthPopover），mirror 4.5 RowHeightPopover。
6. selection / fillRange / clipboard 在列结构变更后做 col remap。
7. FrozenRegions 自动同步：插入冻结区内 → leftCols/rightCols +N；删除冻结列 → 减少；hide/unhide 不动 frozen counts。
8. `MutableDataSource` 加 optional `insertField` / `removeField`；index-based 插入，fieldId-based 删除。
9. SortLayer / FilterLayer 在 `colsDeleted` 命中其 spec.fieldId 时 invalidate spec（FilterLayer 已有 schemaChanged 路径需扩展，SortLayer 新增对称逻辑）。
10. 配套 README / context-menu spec / 4.5 spec / CLAUDE.md 联动改动作为交付物。

---

## 3. Non-Goals（4.6）

- 列拖拽重排（→ Phase 4.7）
- 字段类型选择 / 字段编辑器弹层（→ Phase 6）
- 列复制 / 跨列粘贴 / 合并列（→ Phase 5+）
- 不连续 multi-range col selection
- 持久化 hidden cols / 列宽 / 字段定义到 storage
- 服务端 schema 变更协议（→ Phase 8）

---

## 4. UX

### 4.1 列头右键菜单（在 4.4 sort/filter 之后追加）

```
（4.4 已有）升序 / 降序 / 清除排序
（4.4 已有）筛选… / 清除筛选
─── separator ───
在左侧插入 N 列 / Insert N column(s) left
在右侧插入 N 列 / Insert N column(s) right
─── separator ───
删除 N 列 / Delete N column(s)
隐藏 N 列 / Hide N column(s)
显示选区内隐藏列 / Unhide cols in selection      ← 条件项
─── separator ───
调整列宽… / Resize column width…
```

| 菜单项 id | 触发底层动作 | enable 条件 |
| --- | --- | --- |
| `insert-col-left` | `insertCols(at = minSelectedSchemaIndex, count = N)` | selection ≥ 1 列 |
| `insert-col-right` | `insertCols(at = maxSelectedSchemaIndex + 1, count = N)` | selection ≥ 1 列 |
| `delete-cols` | `deleteCols(fieldIds[])` | selection ≥ 1 列 |
| `hide-cols` | `hideCols(fieldIds[])` | selection ≥ 1 列且非全已隐藏 |
| `unhide-cols` | `unhideCols(fieldIdsInGap[])` | 选区跨越至少 1 个 hidden gap |
| `resize-column-width` | 弹层 → `setColumnWidths(fieldIds[], px)` | selection ≥ 1 列 |

N = `selection.range.colCount`；label 动态拼数字。

**坐标系翻译**：菜单 action handler 在调底层方法前完成 `view col index → fieldId → schema field index` 翻译。Insert 用 schema field index；Hide / Unhide / Resize / Delete 用 fieldId（稳定）。

### 4.2 右键列头选中整列

- 右键命中列头 → 选整列：`activeCell = { rowIndex: 0, colIndex: schemaColIndex }`，selectedRange = `{ startRow: 0, endRow: rowCount-1, startCol: schemaColIndex, endCol: schemaColIndex }`。与 4.5 行头右键选整行（active 锚到 col 0）对称。
- 已选区跨多列时右键命中区内 → 保留选区，N 取 `selection.range.colCount`。
- 右键命中区外 → 改选该单列。

### 4.3 触发与状态机

| 事件 | 命中 | 行为 |
| --- | --- | --- |
| `contextmenu` | 列头 | `preventDefault`；按 §4.2 更新 selection；菜单在 pointer 处打开（复用 4.4 已有路由 + 4.6 新菜单项） |
| `contextmenu` | resize / hide-toggle handle | handle 内 `stopPropagation`，菜单不弹 |
| `contextmenu` | 列头 + cell 编辑中 | 先 commit 编辑（同 blur 路径），再开菜单 |
| `contextmenu` | drag-select / resize-drag 进行中 | `preventDefault`，不开 |
| `Shift+F10` 焦点在列头 | — | 复用 4.4 既有列头 menu 触发；4.6 自动包含新菜单项 |

### 4.4 Hide 边界三角指示器

- 在隐藏区间**左右两个可见列**的分隔线上画一对水平三角（左指向右、右指向左）。
- `headerHeight ≥ 24` 时绘制；否则跳过（理论恒成立，留主题变体接口）。
- 点击三角 → `unhideCols(fieldIdsInGap)`；hit-zone 走 DOM `<handle-layer>` sibling（ADR §A.6，mirror 4.5 行 hide-toggle）。
- 主题 token 新增 `theme.dimensions.hideColTriangleOffset / hideColTrianglePadY`；icons 复用 4.5 `hideBoundaryUp / hideBoundaryDown`（painter 通过 `ctx.rotate(±90deg)` 转向）。

### 4.5 Resize column width 弹层

- DOM popover，**mirror RowHeightPopover**：input + Enter 提交 / Esc / 失焦取消 / 焦点恢复。
- 新建 `ColumnWidthPopover.ts`（与 RowHeightPopover 同目录、几乎复制）；4.6 不抽公共基类（YAGNI；Phase 5+ 第三类弹层出现再说）。
- 提交时调用 `Grid.setColumnWidths(fieldIds, px)`；Grid 内入 undo 栈。
- ARIA：`role="dialog" aria-modal="true" aria-label="调整列宽"`；input 打开时聚焦 + select all。

### 4.6 FrozenRegions 自动调整规则

| 操作 | leftCols | rightCols |
| --- | --- | --- |
| Insert at `at`, count `N`, `at < leftCols` | +N | 不变 |
| Insert at `at`, `at == leftCols`（边界）| **不变**（新列归非冻结，Sheets 语义）| 不变 |
| Insert at `at`, `at < totalCols - rightCols` | 不变 | 不变 |
| Insert at `at`, `at >= totalCols - rightCols`（边界或内）| 不变 | +N |
| Delete fieldIds（含 frozen 区内列）| leftCols -= 命中左 frozen 区的删除数 | rightCols -= 命中右 frozen 区的删除数 |
| Hide / Unhide | **不动** | **不动** |

**全部 leftCols 列被 hide 后**：视图上 frozen 左区为空。painter 按 view 列迭代天然处理；分隔线位置 = 0px 自然消失。Open Question OQ1 涵盖。

### 4.7 ARIA / 键盘 / 与其它交互的关系

- 列头 menu 复用 4.0 ContextMenuLayer 容器（4.4 已接入），4.6 加新菜单项即可。
- Sort / Filter 激活下列结构变更：spec 通过 fieldId 引用字段；删除字段命中 spec.fieldId → invalidate（§5.5 SortLayer / FilterLayer 联动）。
- 编辑期：右键打开 menu 前 commit/cancel 编辑（与 4.0 / 4.5 一致）。
- 列宽 drag resize（3.4）保持单列；菜单弹层走多列批量。
- 4.5 行 hide 三角 + 4.6 列 hide 三角共享 `colors.hideIndicator` 与 SVG path token；视觉一致。

---

## 5. Engine + Schema mutation 架构

### 5.1 MutableDataSource 扩 2 个 optional 方法

```ts
// packages/core/src/data/MutableDataSource.ts
export interface MutableDataSource extends DataSource {
  updateCell(rowIndex: number, fieldId: string, value: CellValue): void
  updateCellByUnderlyingRow?(underlyingRow: number, fieldId: string, value: CellValue): void
  insertRows?(beforeUnderlyingRow: number, count: number): readonly number[]
  deleteRows?(underlyingRowIds: readonly number[]): readonly DeletedRowSnapshot[]

  /**
   * 在 schema.fields 的 beforeIndex 位置之前插入 1 个新字段。返回新字段。
   * 同步触发 colsInserted 事件；不额外触发 schemaChanged。Phase 4.6。
   */
  insertField?(beforeIndex: number, field: Field): Field

  /**
   * 按 fieldId 删除字段。返回 RemovedFieldSnapshot（含 field 定义 + 该列所有 cell 值），供 undo 还原。
   * 同步触发 colsDeleted 事件；不额外触发 schemaChanged。Phase 4.6。
   */
  removeField?(fieldId: string): RemovedFieldSnapshot | null
}

export interface RemovedFieldSnapshot {
  readonly originalIndex: number
  readonly field: Field
  readonly cells: ReadonlyArray<CellValue | undefined>  // 长度 = removeField 时 rowCount
}
```

### 5.2 DataSourceEvent 扩 2 个 variant

```ts
export type DataSourceEvent =
  | { type: 'reset' }
  | { type: 'rowsChanged'; startIndex: number; endIndex: number }
  | { type: 'rowsInserted'; at: number; count: number }
  | { type: 'rowsDeleted'; removed: readonly number[] }
  | { type: 'colsInserted'; at: number; field: Field }                                  // 4.6 新
  | { type: 'colsDeleted'; removed: readonly { index: number; fieldId: string }[] }    // 4.6 新
  | { type: 'schemaChanged' }
  | { type: 'rowCountChanged'; newCount: number }
```

`colsInserted` / `colsDeleted` 是结构变更精确事件；`insertField` / `removeField` 不额外发 `schemaChanged`。`schemaChanged` 保留给 setData / 字段类型变更等更宽泛场景。

### 5.3 DefaultGridEngine 新增字段与方法

```ts
// 已有（4.5）
private hideRowsLayer = new HideRowsLayer()
private rawRowsAxis: ChunkedAxis
private rowsAxis: ChunkedAxis

// 4.6 新增
private hiddenColIds: Set<string> = new Set()
private rawColsAxis: ChunkedAxis   // 按 schema field index 存列宽
private colsAxis: ChunkedAxis       // 视图列轴（已扣 hidden）
private newFieldCounter = 0         // §OQ4 每 Grid 实例计数器，setData 时清零

// 4.6 新公共方法
insertCols(beforeFieldIndex: number, count: number): readonly Field[]
deleteCols(fieldIds: readonly string[]): readonly RemovedFieldSnapshot[]
hideCols(fieldIds: readonly string[]): void
unhideCols(fieldIds: readonly string[]): void
setColumnWidths(fieldIds: readonly string[], widthPx: number): void
getHiddenCols(): readonly string[]
```

`insertCols(beforeFieldIndex, count)` 内部生成 N 个：
```ts
{
  id: 'field_' + (++this.newFieldCounter),
  name: '新列 ' + this.newFieldCounter,
  type: 'text',
  width: this.theme.metrics.cellMinWidth ?? 100,
}
```
然后调 N 次 `rawData.insertField(beforeFieldIndex + i, field)`，返回新字段列表。

### 5.4 一次 col mutation 的内部序列（以 insertCols 为例）

1. 生成 N 个新 Field（auto-id + auto-name + text type + default width）
2. snapshot：`selectionBefore`, `frozenBefore = frozen.getFrozenConfig()`
3. for i in 0..N-1: `rawData.insertField(at + i, newFields[i])` —— 触发 N 次 `colsInserted`
4. `rawColsAxis.insertRange(at, N, defaultColWidth)` —— 同步 raw 列轴
5. `rebuildViewColsAxis()` —— 重建 view 列轴
6. `syncFrozenAfterColInsert(at, N)` —— 按 §4.6 规则调整 leftCols / rightCols
7. `selection.remapAfterColsInserted(at, N)` —— 新增方法，与 row 对称
8. snapshot `selectionAfter`, `frozenAfter`
9. push UndoCommand `{ kind: 'insertCols', at, count, newFields, selectionBefore, selectionAfter, frozenBefore, frozenAfter }`

`deleteCols / hideCols / unhideCols / setColumnWidths` 同构，差异在 step 3-7 具体动作。Hide/Unhide 不触发 `rawColsAxis` 变化 + 不触发 frozen 调整。

### 5.5 SortLayer / FilterLayer 对 colsDeleted 的对称处理

- `colsInserted` 不影响任何 spec —— 新字段 spec 未引用过。
- `colsDeleted` 命中 spec.fieldId：FilterLayer 已有 `schemaChanged` invalidation 路径需要 **扩展为也响应 `colsDeleted`**；SortLayer 同款扩展（4.4 spec invalidation 在 SortLayer 当前实现是否完整需 verify）。
- 与 4.5 freeze fix 一致：SortLayer / FilterLayer handleUpstreamEvent 对 `colsInserted` / `colsDeleted` 走 **本层 rebuild + emit**，**不再触发 `pipeline.rebuild`**（避免 4.5 同款 emit for-of 死循环）。

### 5.6 raw / view colsAxis 拆分（mirror 4.5 polish）

- `rawColsAxis: ChunkedAxis(count = schema.fields.length, defaultSize = cellMinWidth)` 承担 setSize / insertRange / deleteRange mutation
- `colsAxis = buildViewColsAxis()`：迭代 `schema.fields`，跳过 `hiddenColIds.has(field.id)`，对每个 visible field 把 `rawColsAxis.getSize(originalIndex)` 复制过来
- 每次 hide/unhide/insert/delete/setColumnWidth 后调 `rebuildViewColsAxis()` + 同步 viewport / frozen 持有的引用
- Renderer 看 `colsAxis`（view），看不到隐藏列

---

## 6. UndoCommand 扩展 + coords remap

### 6.1 5 个新 variant

```ts
export type UndoCommand =
  // ... 既有 11 个 variant（含 4.5 行 mutation 5 个）
  | {
      readonly kind: 'insertCols'
      readonly at: number                  // schema field index
      readonly count: number
      readonly newFields: readonly Field[]  // 完整定义（不重新走 counter）
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
      readonly frozenBefore: FrozenConfig
      readonly frozenAfter: FrozenConfig
    }
  | {
      readonly kind: 'deleteCols'
      readonly snapshots: readonly RemovedFieldSnapshot[]
      readonly deletedWidths: readonly number[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
      readonly frozenBefore: FrozenConfig
      readonly frozenAfter: FrozenConfig
    }
  | {
      readonly kind: 'hideCols'
      readonly fieldIds: readonly string[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
  | {
      readonly kind: 'unhideCols'
      readonly fieldIds: readonly string[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
  | {
      readonly kind: 'resizeColumnsMulti'
      readonly fieldIds: readonly string[]
      readonly oldWidths: readonly number[]
      readonly newWidth: number
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
```

### 6.2 apply / unapply 对称

| Command | apply (redo) | unapply (undo) |
| --- | --- | --- |
| `insertCols` | 调 N 次 `mutableDS.insertField(at + i, newFields[i])` —— **必须用 snapshot 中的 Field（包括 id），不能走 counter 重新生成**；rebuild axis / frozen / selection 按 cmd.*After | for each: `mutableDS.removeField(newFields[i].id)`；恢复 axis / frozen / selection 按 cmd.*Before |
| `deleteCols` | for each snap: `mutableDS.removeField(snap.field.id)` + 同步 axis / selection / frozen；SortLayer / FilterLayer 响应 `colsDeleted` 自行 invalidate spec | for each snap: `mutableDS.insertField(snap.originalIndex, snap.field)` + 用 `updateCell` 回填 snap.cells + 恢复 axis 列宽 + 恢复 frozen / selection；core engine 不持有 ViewPipeline，不恢复 sort/filter spec |
| `hideCols` / `unhideCols` | `hiddenColIds.add(id) / delete(id)` + rebuildViewColsAxis + selection | mirror |
| `resizeColumnsMulti` | for each fieldId: `rawColsAxis.setSize(schema.indexOf(id), newWidth)` + rebuildViewColsAxis | 逐 fieldId 还原 oldWidths[i] |

**关键不变量（Invariant §7.4 #3）**：`insertCols` UndoCommand 必须存 newFields 完整定义；redo 路径必须用 snapshot 中的 Field（包括 id），不能再走 counter 生成新 id。否则 LIFO 下后续 hideCols / deleteCols 持有的 id 失效。这是 4.5 行 mutation 没有的新约束。

### 6.3 setData 清栈

- `Grid.setData(...)`：清 UndoStack、HideRowsLayer（4.5）、`hiddenColIds`（4.6 新增）、重置 frozen 为 `options.frozen`、`newFieldCounter` 清零。

### 6.4 coords/remap.ts 补对称函数

```ts
// packages/core/src/coords/remap.ts
export function remapColIndexAfterInsert(colIndex: number, at: number, count: number): number {
  if (colIndex < at) return colIndex
  return colIndex + count
}

export function remapColIndexAfterDelete(
  colIndex: number,
  removedSorted: readonly number[],
): number | null {
  let shift = 0
  for (const removed of removedSorted) {
    if (removed === colIndex) return null
    if (removed < colIndex) shift += 1
    else break
  }
  return colIndex - shift
}
```

`SelectionModel` 加 `remapAfterColsInserted` / `remapAfterColsDeleted`（与 4.5 行版完全对称，调 remap.ts helper）。

---

## 7. Renderer / Painter / DOM 改动

### 7.1 受影响文件

| 文件 | 改动 |
| --- | --- |
| `packages/core/src/render/RenderFrame.ts` | 加 `collapsedColGaps: readonly RenderFrameCollapsedColGap[]`（mirror 4.5 `collapsedRowGaps`） |
| `packages/core/src/engine/DefaultGridEngine.ts` | `getFrame()` 填 `collapsedColGaps`（可见区裁剪 + xPx）；输出 `colsAxis` = view 列轴 |
| `packages/web-canvas2d/src/painters/HeaderPainter.ts` | 消费 `frame.collapsedColGaps`，每 gap 的 view-col 右边界 X 处画一对水平三角 |
| `packages/core/src/theme/denseGridTheme.ts` | 加 `dimensions.hideColTriangleOffset / hideColTrianglePadY`；icons 复用 4.5 |
| `packages/web/src/handle/HideColToggleHandle.ts` | 新建：mirror `HideToggleHandle.ts`，每 col gap 渲染透明命中区位于列头区域 |
| `packages/web/src/runtime/WebGridRuntime.ts` | 装配 `HideColToggleHandle` + 每帧 sync；invokeColumnHeaderContextMenuAction 内 resize-column-width 分支接 ColumnWidthPopover |
| `packages/web/src/overlay/ColumnWidthPopover.ts` | 新建：mirror RowHeightPopover（input + Enter/Esc/blur + destroy 幂等） |
| `packages/web/src/backends/Canvas2DBackend.ts` | 实例化 HideColToggleHandle + ColumnWidthPopover + 注入 runtime + destroy 时 cleanup |

### 7.2 RenderFrame 字段增量

```ts
export interface RenderFrameCollapsedColGap {
  readonly atViewCol: number       // 上邻可见 view-col index
  readonly hiddenCount: number
  readonly hiddenFieldIds: readonly string[]
  readonly xPx: number              // view-col 右边界在 canvas 上的 X（已扣 scrollLeft）
}

export interface RenderFrame {
  // ... 既有
  readonly collapsedRowGaps: readonly RenderFrameCollapsedGap[]    // 4.5
  readonly collapsedColGaps: readonly RenderFrameCollapsedColGap[]  // 4.6
}
```

engine 内：`hiddenColIds` 转 schema 中有序索引 → 分连续段 → 每段算 atViewCol / hiddenCount / hiddenFieldIds → 按可见区裁剪 → 加 xPx = `colsAxis.indexToPosition(atViewCol + 1) - viewport.scrollLeft`。

### 7.3 三角绘制规则

- 仅在 `frame.viewport.headerHeight ≥ 24` 时绘制。
- 在 view-col 右边界 X 处画一对小三角：
  - 左三角：x = `xPx - hideColTrianglePadX - 8`, y = `headerHeight/2 - 3`，朝右
  - 右三角：x = `xPx + hideColTrianglePadX`, y = `headerHeight/2 - 3`，朝左
- 复用 4.5 SVG path（rotate 90deg）或新加 path token，按 painter 实现 ergonomic 决定
- 颜色 `theme.colors.hideIndicator`（4.5 既有）

### 7.4 DOM HideColToggleHandle

mirror `HideToggleHandle.ts`：
- `update(gaps, frame)` 参数 = collapsedColGaps + `{ headerHeight }`
- 每 handle：`position: absolute; top: 0; height: headerHeight; left: xPx - 8; width: 16; cursor: pointer`
- pointerdown → `opts.onUnhide(gap.hiddenFieldIds)`
- `destroy()` 清 elements（与 4.5 对称）

### 7.5 ColumnWidthPopover

mirror `RowHeightPopover.ts`：
- `open({x, y, width, height}, currentWidth)`：定位用 `lastContextMenuPoint`；currentWidth 取选中首列宽度
- onSubmit(px) → backend 用 `pendingColumnWidthFieldIds`（runtime 暂存）调 `runtime.setColumnWidths(ids, px)`
- `destroy()` 幂等
- ARIA `role="dialog" aria-modal="true" aria-label="调整列宽"`

---

## 8. 测试与 Storybook

### 8.1 测试矩阵（12 个文件）

| 文件 | 覆盖范围 |
| --- | --- |
| `packages/core/tests/data/InMemoryDataSource.insertDeleteField.test.ts` | insertField 返回 Field + colsInserted；removeField 返回 snapshot 全列 + colsDeleted |
| `packages/core/tests/coords/remap.test.ts`（追加） | remapColIndexAfterInsert / Delete 4 case |
| `packages/core/tests/interaction/SelectionModel.remap.test.ts`（追加） | remapAfterColsInserted / Deleted 3 case |
| `packages/core/tests/engine/DefaultGridEngine.col-mutations.test.ts` | 5 类列 mutation + axis + selection + undo；hide cols 后 frame.colsAxis 与 view 列数一致；setData 清 hiddenColIds |
| `packages/core/tests/engine/DefaultGridEngine.frozen-cols-sync.test.ts` | §4.6 Frozen 自动调整：插入冻结区内 → leftCols++；删除冻结列 → leftCols--；边界 (at == leftCols) 插入不变；hide/unhide 不动 |
| `packages/core/tests/engine/DefaultGridEngine.col-undo.test.ts` | UndoCommand 5 个新 variant apply/unapply 对称；insertCols redo 用 newFields 稳定 id |
| `packages/core/tests/view/SortFilter.cols-deleted.test.ts` | deleteCols 后 sort/filter spec 命中已删 fieldId → 自动 invalidate；SortLayer.handleUpstreamEvent 新增 colsDeleted 对称处理 |
| `packages/web-canvas2d/tests/painters/HeaderPainter.hide.test.ts` | RecordingContext2D 三角 path/fill；headerHeight < 24 时跳过 |
| `packages/web/tests/Grid.col-menu.test.ts` | 列头右键菜单 5 个新项 + 触发各 Grid facade 方法；不破坏 4.4 sort/filter 入口 |
| `packages/web/tests/overlay/ColumnWidthPopover.test.ts` | open + Enter 提交 + Esc / 失焦 + destroy 幂等 |
| `packages/web/tests/handle/HideColToggleHandle.test.ts` | gap handle 点击触发 onUnhide(fieldIds) |
| `packages/web/tests/integration/Phase46.scenarios.test.ts` | E2E：insertCols + undo 完全还原（含 frozen 状态）；deleteCols 让 sort spec invalidate；hideCols + insertCols 后 hidden fieldIds 按 id 锚定不漂移 |

### 8.2 TDD 节奏

每文件 RED → 实现 → GREEN → commit。`docs(plan): fix ...` 优先于实现，与 4.5 一致。

### 8.3 Storybook story

`apps/storybook/src/stories/ColumnStructural.stories.ts` 3 个 story（mirror 4.5 RowStructural）：

- **Default** —列头右键菜单入口（plain table）
- **InsertDelete** — 按钮触发 `grid.insertCols(3, 2)` / `grid.deleteCols(['team', 'revenue'])`
- **PrefilledHidden** — 挂载后 `grid.hideCols(['date', 'active'])`，按钮触发 unhideCols

### 8.4 性能用例

- 100k 行 × 50 列 InMemory，`hideCols([10 cols])` → rebuildViewColsAxis ≤ 16ms 单帧
- 100k 行 × 50 列，`deleteCols([5 cols])` → rawColsAxis.deleteRange + 50k row cell 移除 ≤ 200ms

### 8.5 既有测试需要更新

- `packages/web/tests/runtime/WebGridRuntime.test.ts`：engine mock 补 6 个新方法
- 任何手动构造 RenderFrame 的 fixture 补 `collapsedColGaps: []`

---

## 9. ADR 影响 + Out of Scope + 跨文档对齐

### 9.1 ADR 影响表

| ADR | 是否影响 | 说明 |
| --- | --- | --- |
| §A.1 单 Canvas 全可见区重绘 | 不影响 | HeaderPainter 多绘三角，仍在单 canvas 内 |
| §A.2 原生滚动 + 非线性 scrollTop | 不影响 | colsInserted/Deleted → ScrollMapper 重算 spacer 走既有 path |
| §A.3 ChunkedAxis CHUNK_SIZE = 1024 | 不影响 | 复用 4.5 既有 insertRange / deleteRange |
| §A.4 DataSource endIndex INCLUSIVE | **小幅修订** | `MutableDataSource` 增 2 个 optional 方法（`insertField` / `removeField`） + `RemovedFieldSnapshot` 类型；`DataSourceEvent` 加 `colsInserted` / `colsDeleted` 2 个 variant |
| §A.5 Theme 唯一视觉源 | 不影响 | 新增 2 个 dimensions token；icons 复用 4.5 |
| §A.6 DOM `<handle-layer>` siblings | 不影响 | 新增 `data-handle="hide-col-toggle"` 节点 |
| §A.7 Per-Grid FrameScheduler | 不影响 | 不引入新 RAF 源 |

### 9.2 Out of Scope（显式 anchor）

| 项 | 状态 | 后续 phase |
| --- | --- | --- |
| 列拖拽重排 + 列头 DOM overlay 命中层 | 不交付 | Phase 4.7 |
| 新建列时字段类型选择弹层 | 不交付 | Phase 6 |
| 字段类型变更 | 不交付 | Phase 6 |
| 列复制（duplicate column with values） | 不交付 | Phase 5+ |
| 跨列粘贴整列 | 不交付 | Phase 5+ |
| 合并列 | 不交付 | Phase 5 单元格合并 |
| 持久化 hidden cols / 列宽到 storage | 不交付 | 消费者自管 |
| 服务端 schema 变更协议 | 不交付 | Phase 8 |
| 非连续多选 col range | 不交付 | Phase 5+ |

### 9.3 跨文档对齐（4.6 实施期最后一个 commit 同步）

| 文档 | 改动 |
| --- | --- |
| `README.md` 当前状态段 | 最近交付 → Phase 4.6；下一里程碑 → Phase 4.7；里程碑总表 4.6 状态 → ✅ + 补 spec 链接 |
| `CLAUDE.md` Current state 三段 | Last shipped / Next milestone / Phase 4 status 同步 |
| `docs/superpowers/specs/2026-05-17-context-menu-design.md` L7 | 「列头扩展项 → Phase 4.6」改「Phase 4.6 已接管」 |
| `docs/superpowers/specs/2026-05-23-novasheet-phase-4-5-row-structural.md` §11.2 | 「列 insert/delete/hide → Phase 4.6」标 ✅ |

---

## 10. Invariants（4.6 强制）

1. 所有列 mutation 入参一律 **fieldId**（Hide/Unhide/Resize/Delete）或 **schema field index**（Insert）；UI 调用方在 Grid facade 边缘完成 view col index → 二者翻译。
2. `MutableDataSource.insertField` / `removeField` 是 optional：未实现 → 列结构菜单项 disabled；不抛错。
3. `insertCols` UndoCommand 必须存 `newFields` 完整定义；redo 路径必须用 snapshot 中的 Field（包括 id），**不能** 重新走 counter 生成新 id。
4. `colsInserted` / `colsDeleted` 事件触发 SortLayer / FilterLayer **内层 rebuild + emit**，**不再触发 `pipeline.rebuild`**（继承 4.5 freeze fix 教训）。
5. 列头 hide 三角走新增 HideColToggleHandle DOM 命中；行号列 hide 三角走 4.5 既有 HideToggleHandle。canvas 始终只画装饰，**不命中**。
6. `hiddenColIds` 用 `Set<string>`（fieldId）；`hiddenUnderlyingRows` 用 `Set<number>`（row index）。两者语义不对称是有意：列有稳定 id，行没有。
7. Selection / FillRange / Clipboard 列坐标 remap 走 `coords/remap.ts` 的 `remapColIndex*` helpers。
8. `setData(dataSource)` 清空 UndoStack + HideRowsLayer（4.5）+ hiddenColIds + 重置 frozen 为 `options.frozen` + newFieldCounter 清零。
9. FrozenRegions 自动调整规则（§4.6）严格：边界 `at == leftCols` 时新列归非冻结；hide/unhide 不动 frozen counts。
10. ColumnWidthPopover + RowHeightPopover **不抽公共基类**（YAGNI）；Phase 5+ 第三类弹层出现再考虑。

---

## 11. Open Questions

| # | 问题 | 临时决定 |
| --- | --- | --- |
| OQ1 | 全部 leftCols 列被 hide 后，frozen 区在视图上空，painter 是否需要特判？ | painter 按 view 列迭代天然处理；分隔线位置 = 0px 自然消失。`Phase46.scenarios.test.ts` 覆盖此场景 |
| OQ2 | 多选不连续列（Ctrl+点）行为？ | 4.6 不支持（SelectionModel 限制）；N 取矩形 colRange |
| OQ3 | `deleteCols` 删除 sort.fieldId / filter.fieldId 后 spec invalidate — UndoCommand 是否存 `sortSpecBefore / filterSpecBefore`？ | 否。`DefaultGridEngine` 不持有 `ViewPipeline`；SortLayer / FilterLayer 响应 `colsDeleted` 精确事件自行 invalidate。Undo 恢复 schema 后不自动恢复 sort/filter spec；若 web 层需要恢复交互状态，后续在 runtime/pipeline 层补显式命令。 |
| OQ4 | 新插入字段 name 自动编号 counter 全局还是每 Grid？ | 每 Grid 实例 counter（`engine.newFieldCounter`）；setData 时清零 |
| OQ5 | `insertCols` 时 MutableDataSource 实现方持有同 id 字段（消费者疏忽 / undo 链冲突）行为？ | `insertField` 实现方应 throw；engine 不 try/catch，让错误冒泡 |

---

## 12. Spec self-review

- [x] 列向 5 类 mutation 全部交付（insert/delete/hide/unhide/resize cols）
- [x] 列头菜单复用 4.4 容器，加新菜单项；行头菜单（4.5）不动
- [x] Schema mutation 走 MutableDataSource 扩展（A 方案），与 4.5 行 mutation 对称
- [x] FrozenRegions 自动同步规则明确、可测
- [x] HideColsLayer 不引入，统一收在 engine 状态（B 方案）
- [x] raw / view colsAxis 拆分（mirror 4.5 polish），避免 painter 越界 bug 复发
- [x] 5 个新 UndoCommand variant；insertCols 必须存 newFields 完整定义这一新约束显式标注
- [x] SortLayer / FilterLayer 在 colsInserted/colsDeleted 事件下不触发 pipeline.rebuild（继承 4.5 freeze fix）
- [x] coords/remap.ts 补 remapColIndexAfter*，SelectionModel 复用 helper
- [x] DOM HideColToggleHandle + ColumnWidthPopover 复用 4.5 模式
- [x] Out of Scope 9 项锚到 4.7 / 5 / 6 / 8
- [x] ADR §A.4 修订显式标注
- [x] Invariants 10 条；Open Questions 5 条全部有临时决定
- [x] 测试矩阵 12 文件 + Storybook 3 story + 性能 2 用例
