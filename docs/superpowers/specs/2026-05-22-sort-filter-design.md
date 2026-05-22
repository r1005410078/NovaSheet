# Phase 4.4 — 排序 / 筛选设计

**日期:** 2026-05-22
**所属阶段:** Phase 4.4（剪贴板与结构操作 / 排序与筛选）
**前置:** Phase 3.1-3.5（选择 / 拖选 / 键盘 / resize / 编辑）、Phase 4.0（列头与 cell 右键菜单）、Phase 4.2（Undo/Redo）、Phase 4.3（填充柄）

---

## 1. 目标与范围

提供桌面表格的列头排序与单列筛选，并把"视图变换"建模为可剥离的 **ViewLayer 协议**——4.4 内置 `SortLayer` / `FilterLayer` 作为协议的第一批参考实现；引擎与 renderer 对排序筛选完全无感。

### 1.1 交付清单

| 能力 | 是否交付 | 说明 |
| --- | --- | --- |
| `ViewLayer` 协议（视图管线） | 是 | 4.4 的核心架构产物——`DataSource → DataSource` 装饰链 |
| `SortLayer`（单列 asc/desc/none 三态） | 是 | 内置参考实现；stable sort；null 一律末尾 |
| `FilterLayer`（单列条件筛选） | 是 | 内置参考实现；按字段 `FieldType` 提供类型化 predicate |
| 列头右键菜单（`targetKind: 'columnHeader'`） | 是 | 复用 4.0 `ContextMenuModel`，泛化菜单目标 |
| 列头排序箭头 + 筛选漏斗指示 | 是 | `HeaderPainter` 通过 `ViewLayer.headerDecoration` 拉取装饰，绘制态 icon |
| Filter popover 面板（按 FieldType 切换控件） | 是 | 与 4.0 的菜单 popover 同样作为 DOM overlay |
| `DataSource.resolveUnderlyingRow / findViewRow`（可选） | 是 | 视图坐标 ↔ 底层稳定行键的双向映射 |
| `MutableDataSource.updateCellByUnderlyingRow`（可选） | 是 | undo/redo 对被过滤行的写入 fallback |
| Undo / Redo 与视图变化的解耦 | 是 | 命令存底层 rowIndex；undo/redo 时映回视图 |
| 选区在视图切换后的重定位 / 自动清空 | 是 | 由 Grid 协调 ViewLayer 事件触发 |
| 编辑会话在视图切换时强制 commit-or-cancel | 是 | 不试图保留编辑态 |
| `viewChange / sortChange / filterChange` 事件 | 是 | 三种粒度同时暴露 |
| 多列复合排序 / 多列复合筛选 | 否 | Phase 5+ 在同协议上叠加 |
| 服务端排序 / 服务端筛选 | 否 | 协议预留，Phase 5+ 引入 server source 时再做参考实现 |
| 自定义 predicate / 外部插件注册 | 否 | 协议先内部稳定一版，4.5 后再开放 |
| Excel 风格按值勾选 distinct 列表（text 类） | 否 | 可作为 `FilterLayer` 的第二种 op (`in-set`) 增量加入 |
| 列头 DOM overlay 层（点击/hover） | 否 | Phase 4.5 列拖拽重排时引入 |

### 1.2 术语

- **底层源（underlying source）**：未经任何 ViewLayer 装饰的最原始 `DataSource`，由 Grid 构造时传入。
- **composed DS**：`ViewPipeline` 套娃后的最外层 `DataSource`，是 `DefaultGridEngine` 实际持有的实例。
- **视图坐标（view rowIndex）**：composed DS 上的 rowIndex `[0, composed.getRowCount())`，引擎、renderer、selection 全部使用此坐标。
- **底层坐标（underlying rowIndex）**：底层源上的 rowIndex；通过 `resolveUnderlyingRow` 从视图坐标翻译而来。
- **spec**：单个 ViewLayer 的当前状态；不可变结构，外部通过 `setSpec(newSpec)` 整体替换。

---

## 2. 架构概览

### 2.1 装配顺序

```
原始 DataSource
   └─ FilterLayer.wrap (先生效)
        └─ SortLayer.wrap (在过滤后的集合上排序)
             = composed DS (engine 持有)
```

Filter 在 Sort 前的理由：过滤后的集合上排序，O((N - filtered) log (N - filtered))，且语义符合直觉。装配顺序在 `Grid` 构造时锁定为 `[FilterLayer, SortLayer]`；4.4 不开放外部插入位置。

### 2.2 主要模块新增 / 修改

| 路径 | 类型 | 用途 |
| --- | --- | --- |
| `packages/core/src/view/ViewLayer.ts` | 新增 | `ViewLayer` 协议、`HeaderDecoration`、`ColumnHeaderMenuContext` |
| `packages/core/src/view/ViewPipeline.ts` | 新增 | 装配 / 重建 / 装饰汇总 / 菜单贡献汇总 |
| `packages/core/src/view/SortLayer.ts` | 新增 | 内置参考实现 |
| `packages/core/src/view/FilterLayer.ts` | 新增 | 内置参考实现 |
| `packages/core/src/view/coordinates.ts` | 新增 | `resolveUnderlyingRow` / `findViewRow` helper |
| `packages/core/src/data/DataSource.ts` | 修改 | 新增两个 optional 方法 |
| `packages/core/src/data/MutableDataSource.ts` | 修改 | 新增 optional `updateCellByUnderlyingRow` |
| `packages/core/src/interaction/ContextMenuModel.ts` | 修改 | 泛化 `targetKind`；新增 `getColumnHeaderContextMenuItems` |
| `packages/core/src/theme/Theme.ts` | 修改 | `icons.sortAsc / sortDesc / filter` |
| `packages/core/src/theme/denseGridTheme.ts` | 修改 | 提供三个 icon 的内联 SVG path |
| `packages/web-canvas2d/src/painters/HeaderPainter.ts` | 修改 | 排序箭头 + 漏斗 icon 绘制 |
| `packages/web/src/interaction/FilterPopover.ts` | 新增 | DOM overlay 面板 |
| `packages/web/src/runtime/WebGridRuntime.ts` | 修改 | 列头右键分派；popover 生命周期；与 fill handle / cell 菜单互斥 |
| `packages/web/src/Grid.ts` | 修改 | 装配 pipeline、暴露事件、`getSortLayer / getFilterLayer / getViewPipeline` |
| `packages/core/src/engine/DefaultGridEngine.ts` | 修改 | 写入路径中把 viewRow 翻译为 underlyingRow 存 undo；undo/redo 反向翻译 |

---

## 3. ViewLayer 协议

### 3.1 接口定义

```ts
// packages/core/src/view/ViewLayer.ts
import type { DataSource } from '../data/DataSource'
import type { Field } from '../data/Schema'
import type { ContextMenuItem } from '../interaction/ContextMenuModel'

export interface ViewLayer<TSpec = unknown> {
  /** 稳定 id（'sort' | 'filter' | 未来 'group' 等）；同 id 在管线中只能存在一个。 */
  readonly id: string

  /** 当前 spec；不可变结构，外部通过 setSpec 整体替换。 */
  getSpec(): TSpec

  /** 整体替换 spec；返回 true 表示触发了 wrap 重建并 emit 事件。 */
  setSpec(spec: TSpec): boolean

  /**
   * 把上游 DataSource 包装为应用此 spec 后的 DataSource。
   * 返回的源必须：
   *   1. 实现 resolveUnderlyingRow / findViewRow（在上游基础上叠加自身映射）
   *   2. 透传上游 schemaChanged / rowsChanged，按需翻译 rowIndex
   *   3. 在 spec 变更或上游 reset 时 emit 自己的 reset
   *   4. 若上游是 MutableDataSource，返回的源也是 MutableDataSource（updateCell + updateCellByUnderlyingRow 都翻译并透传）
   */
  wrap(upstream: DataSource): DataSource

  /** UI 扩展点（可选）：列头装饰；返回 null 表示该列无装饰。 */
  headerDecoration?(field: Field): HeaderDecoration | null

  /**
   * UI 扩展点（可选）：列头右键菜单贡献——按当前 spec 给出本层菜单项。
   * `ctx.targetKind === 'columnHeader'` 时由 ViewPipeline 调用；4.4 不在 cell 菜单上贡献项。
   */
  contextMenuItems?(ctx: ColumnHeaderMenuContext): readonly ContextMenuItem[]
}

export interface HeaderDecoration {
  /** 排序箭头：'asc' | 'desc' | null；仅 SortLayer 设置 */
  readonly sortIndicator?: 'asc' | 'desc' | null
  /** 筛选漏斗激活态：true 表示该列被某 FilterLayer 装饰 */
  readonly filterActive?: boolean
}

export interface ColumnHeaderMenuContext {
  readonly targetKind: 'columnHeader'
  readonly field: Field
  readonly colIndex: number
}
```

### 3.2 ViewPipeline

```ts
// packages/core/src/view/ViewPipeline.ts
export class ViewPipeline {
  constructor(source: DataSource)

  /** 顺序追加；4.4 仅由 Grid 在构造时使用，外部不调。 */
  add(layer: ViewLayer): void

  /** 4.4 范围内：仅供未来插件抽离用 */
  remove(layerId: string): void

  get(layerId: string): ViewLayer | undefined

  /** spec 变化时由 layer 通知；内部重建套娃链并 emit 通知。 */
  rebuild(): void

  /** Engine 持有的 DS。 */
  getComposed(): DataSource

  /** HeaderPainter 调用，合并各层 headerDecoration（多层都装饰时按 id 顺序覆盖；4.4 sort 与 filter 不冲突字段）。 */
  collectHeaderDecorations(field: Field): HeaderDecoration

  /** 列头右键时各层贡献，按 add 顺序拼接。 */
  collectColumnHeaderMenuItems(ctx: ColumnHeaderMenuContext): readonly ContextMenuItem[]

  /**
   * 订阅 spec 变化 / 上游 reset。
   *
   * 回调入参：
   *  - `reason`: 触发原因——
   *      `'spec-changed'`：某 layer 的 spec 替换；旧数据未变，oldResolveUnderlyingRow 仍可用于重映射
   *      `'upstream-reset'`：上游 emit 了 reset / rowCountChanged / schemaChanged；旧 rowIndex 语义已失效，
   *                          消费者应放弃重映射、清空依赖 rowIndex 的状态
   *  - `oldResolveUnderlyingRow`: rebuild 之前 composed DS 的 resolveUnderlyingRow 函数引用；
   *      仅在 reason === 'spec-changed' 时使用才有意义。
   */
  subscribe(
    listener: (
      reason: 'spec-changed' | 'upstream-reset',
      oldResolveUnderlyingRow: (viewRow: number) => number,
    ) => void,
  ): () => void
}
```

### 3.3 Grid 集成

```ts
// packages/web/src/Grid.ts —— 新增公开 API
grid.getSortLayer(): SortLayer
grid.getFilterLayer(): FilterLayer
grid.getViewPipeline(): ViewPipeline   // 4.4 只读 facade；不开放 add / remove
```

`setData(newSource)`：

1. 强制结束编辑（commitCellEdit；失败则 cancelCellEdit）
2. 关闭 context menu 与 Filter popover
3. 清空 selection
4. **清空两个 layer 的 spec**（新数据可能字段类型/语义不同，安全起见）
5. 用 newSource 重建 pipeline 并把 `composed` 喂给 engine

---

## 4. SortLayer

### 4.1 接口

```ts
// packages/core/src/view/SortLayer.ts
export type SortDirection = 'asc' | 'desc'

export interface SortSpec {
  readonly fieldId: string
  readonly direction: SortDirection
}

export class SortLayer implements ViewLayer<SortSpec | null> {
  readonly id = 'sort'

  /** 三态循环：null → asc → desc → null。Header 菜单调用。 */
  cycle(fieldId: string): void

  /** 当前是否对该列排序，及方向。 */
  getDirection(fieldId: string): SortDirection | null

  getSpec(): SortSpec | null
  setSpec(spec: SortSpec | null): boolean
  wrap(upstream: DataSource): DataSource
  headerDecoration(field: Field): HeaderDecoration | null
  contextMenuItems(ctx: ColumnHeaderMenuContext): readonly ContextMenuItem[]
}
```

### 4.2 类型化比较器

| FieldType | 比较器 | null / "空" 处理 |
| --- | --- | --- |
| `text` / `url` | `Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })` | null 与 `''` 一律末尾 |
| `number` | 数值比较；`NaN` 视同 null | null / NaN 末尾 |
| `date` | `Date.getTime()`；非 Date 强转失败 → null | null 末尾 |
| `checkbox` | `false < true`；非布尔视 null | null 末尾 |
| `singleSelect` | 按 `schema.field.options.choices` 数组中的序号；choices 缺失则降级为 text | null 末尾 |
| `multiSelect` | **不可排序**——`SortLayer` 拒绝此类型的 spec；菜单项禁用 | — |

"null 末尾" 不暴露成 spec 选项；asc / desc 都把 null 放末尾，与 Sheets 行为一致。

### 4.3 装饰器实现

`SortedDataSource`：

- spec 为 null → 退化为对上游的透明代理。
- spec 非 null：
  - `order: Int32Array(n)`，初始填 `0..n-1`，stable sort by `comparator(upstream.getCell(order[i], spec.fieldId))`。
  - `inverse: Int32Array(n)`，由 `order` 反向填充。
  - `getCell(viewIdx, fid) → upstream.getCell(order[viewIdx], fid)`
  - `getRows(start, end)`：遍历 `[start, end]`，对每个视图行调 `upstream.getCell(order[v], ...)` 拼装 `Row`（即便上游能 batch，也只能逐行翻译；endIndex inclusive 保持不变）。
  - `resolveUnderlyingRow(viewIdx) → upstream.resolveUnderlyingRow?.(order[viewIdx]) ?? order[viewIdx]`
  - `findViewRow(underlyingIdx)`：
    ```
    upRow = upstream.findViewRow?.(underlyingIdx) ?? underlyingIdx
    return inverse[upRow] ?? -1   // 数组越界视为 -1
    ```
  - `updateCell(viewIdx, fid, value) → upstream.updateCell(order[viewIdx], fid, value)`
  - `updateCellByUnderlyingRow(underlyingRow, fid, value) → upstream.updateCellByUnderlyingRow?.(underlyingRow, fid, value)`；上游不支持时回退 `upstream.updateCell(upstream.findViewRow?.(underlyingRow) ?? underlyingRow, fid, value)`。
- 上游事件处理：
  - `reset / rowCountChanged / schemaChanged` → 全量重建 `order/inverse` → re-emit 同事件
  - `rowsChanged` → 透传，不重新排序（用户改一个 cell 不应让该行突然跳走，与 Sheets 行为一致）

### 4.4 菜单贡献

```
contextMenuItems(ctx):
  const field = ctx.field
  const sortable = isSortable(field.type)         // field.type !== 'multiSelect'
  const dir = sortable ? getDirection(field.id) : null
  return [
    { id: 'sort-asc',  label: '升序',     disabled: !sortable,    checked: dir==='asc' },
    { id: 'sort-desc', label: '降序',     disabled: !sortable,    checked: dir==='desc' },
    { id: 'sort-none', label: '清除排序', disabled: dir === null, separatorAfter: true },
  ]
```

### 4.5 headerDecoration

```
headerDecoration(field):
  if spec === null || spec.fieldId !== field.id: return null
  return { sortIndicator: spec.direction }
```

---

## 5. FilterLayer

### 5.1 FilterOp

```ts
// packages/core/src/view/FilterLayer.ts
export type FilterOp =
  | { kind: 'text-contains'; value: string; caseSensitive: boolean }
  | { kind: 'text-equals'; value: string; caseSensitive: boolean }
  | { kind: 'number-between'; min: number | null; max: number | null }     // 任一端 null = 该端不限
  | { kind: 'number-equals'; value: number }
  | { kind: 'date-between'; start: Date | null; end: Date | null }         // 闭区间
  | { kind: 'select-in'; values: readonly string[] }
  | { kind: 'checkbox-equals'; value: boolean }
  | { kind: 'is-empty' }
  | { kind: 'is-not-empty' }

export interface FilterSpec {
  readonly fieldId: string
  readonly op: FilterOp
}

export class FilterLayer implements ViewLayer<FilterSpec | null> {
  readonly id = 'filter'

  isActive(fieldId: string): boolean
  getSpec(): FilterSpec | null
  setSpec(spec: FilterSpec | null): boolean
  clear(fieldId?: string): void   // 不传 fieldId → 等价 setSpec(null)

  wrap(upstream: DataSource): DataSource
  headerDecoration(field: Field): HeaderDecoration | null
  contextMenuItems(ctx: ColumnHeaderMenuContext): readonly ContextMenuItem[]
}
```

### 5.2 FieldType ↔ 可用 op

| FieldType | 默认 op（弹窗首项） | 全部可用 op |
| --- | --- | --- |
| `text` / `url` | `text-contains` | `text-contains`, `text-equals`, `is-empty`, `is-not-empty` |
| `number` | `number-between` | `number-between`, `number-equals`, `is-empty`, `is-not-empty` |
| `date` | `date-between` | `date-between`, `is-empty`, `is-not-empty` |
| `singleSelect` | `select-in` | `select-in`, `is-empty`, `is-not-empty` |
| `multiSelect` | `select-in` | `select-in`（行的数组与所选集合有交集 = 命中）, `is-empty`, `is-not-empty` |
| `checkbox` | `checkbox-equals` | `checkbox-equals`, `is-empty`, `is-not-empty` |

「空」的统一定义：`null` 或 `undefined` 或 `''`（文本）或 `[]`（multiSelect）。

`text-contains / text-equals` 默认 `caseSensitive: false`。

**`singleSelect / multiSelect` 字段缺 `options.choices` 的处理**：predicate 仍可工作（`select-in` 比较的是单元格里的字符串值/字符串数组，不依赖 schema 的 choices 列表）；但 UI 没有 choices 可渲染——见 §7.4 「空 choices fallback」。

### 5.3 装饰器实现

`FilteredDataSource`：

- spec 为 null → 透明代理。
- spec 非 null：
  - 全表扫描一次，构造 `order: Int32Array`，存「满足 predicate 的上游 rowIndex」。
  - `inverse: Int32Array(upstreamRowCount).fill(-1)`，对每个 view rowIndex 填 `inverse[order[v]] = v`。
  - `getRowCount() → order.length`
  - `getCell / getRows / resolveUnderlyingRow / findViewRow / updateCell / updateCellByUnderlyingRow` 与 SortedDataSource 同形，只是 `order` 含义不同（视图 idx → 上游 idx，但少于 N）。
- 上游事件：
  - `reset / rowCountChanged / schemaChanged` → 全量重建 + re-emit
  - `rowsChanged` → 透传，不重新评估 predicate（用户编辑让某行不再匹配筛选时，该行仍保留可见——与 Sheets 行为一致）

### 5.4 schemaChanged 失效降级

- spec.fieldId 在新 schema 中不存在 → `setSpec(null)` + emit reset
- spec.op 类型与新 field.type 不兼容 → 同上

### 5.5 菜单贡献

```
contextMenuItems(ctx): [
  { id: 'filter-open',  label: isActive(field.id) ? '编辑筛选...' : '筛选...', disabled: false },
  { id: 'filter-clear', label: '清除此列筛选',                                  disabled: !isActive(field.id), separatorAfter: true },
]
```

### 5.6 headerDecoration

```
headerDecoration(field):
  if !isActive(field.id): return null
  return { filterActive: true }
```

---

## 6. DataSource 接口扩展

```ts
// packages/core/src/data/DataSource.ts
export interface DataSource {
  // ...既有方法

  /**
   * 视图坐标 → 底层稳定行键。
   * - 非装饰源不实现；helper 按 identity 返回 rowIndex。
   * - 装饰源必须实现；递归通过上游链翻译到最底层源。
   * - 返回 -1 表示该视图行无底层映射（保留给未来 grouping 聚合行；4.4 不返回 -1）。
   */
  resolveUnderlyingRow?(rowIndex: number): number

  /**
   * 底层行键 → 当前视图坐标。
   * - 非装饰源不实现；helper 按 identity 返回 underlyingRow。
   * - 装饰源必须实现；递归通过上游链反向翻译。
   * - 返回 -1 表示该底层行被当前视图过滤掉 / 不可见。
   */
  findViewRow?(underlyingRow: number): number
}

// packages/core/src/data/MutableDataSource.ts
export interface MutableDataSource extends DataSource {
  updateCell(rowIndex: number, fieldId: string, value: CellValue): void

  /**
   * 按底层坐标直接写。装饰源把调用透传到上游同名方法，最终落到最底层源；
   * 用于 undo / redo：保证被过滤掉的行也能写回底层。
   * 缺省时引擎走 fallback：data.updateCell(findViewRow(data, underlyingRow), ...)。
   */
  updateCellByUnderlyingRow?(underlyingRow: number, fieldId: string, value: CellValue): void
}
```

Helper（`packages/core/src/view/coordinates.ts`）：

```ts
export function resolveUnderlyingRow(source: DataSource, viewRow: number): number {
  return source.resolveUnderlyingRow?.(viewRow) ?? viewRow
}

export function findViewRow(source: DataSource, underlyingRow: number): number {
  return source.findViewRow?.(underlyingRow) ?? underlyingRow
}
```

**契约约束**：

- `resolveUnderlyingRow` / `findViewRow` 是纯查询，不能 emit 事件、不能触发 wrap 重建。
- spec 不变期间，两个方法对同一 underlyingRow / viewRow 互为逆映射（双射 invariant，过滤掉的行除外）。
- 装饰器实现时用 `Int32Array` 存映射，避免 Number 装箱。

---

## 7. UI 集成

### 7.1 ContextMenuModel 泛化

```ts
// packages/core/src/interaction/ContextMenuModel.ts
export type ContextMenuTargetKind = 'cell' | 'columnHeader'

export type ContextMenuAction =
  | 'cut' | 'copy' | 'paste'
  | 'sort-asc' | 'sort-desc' | 'sort-none'
  | 'filter-open' | 'filter-clear'

export interface CellMenuContext {
  readonly targetKind: 'cell'
  readonly cell: CellAddress
  readonly selectedRange: CellRange | null
  readonly hasSelection: boolean
  readonly clipboardReady: boolean
}

export interface ColumnHeaderMenuContext {
  readonly targetKind: 'columnHeader'
  readonly field: Field
  readonly colIndex: number
}

export type ContextMenuContext = CellMenuContext | ColumnHeaderMenuContext

export interface ContextMenuItem {
  readonly id: ContextMenuAction
  readonly label: string
  readonly disabled: boolean
  readonly checked?: boolean
  readonly separatorAfter?: boolean
}

/** 4.0 cell 菜单——保留原签名兼容。 */
export function getCellContextMenuItems(ctx: CellMenuContext): readonly ContextMenuItem[]

/** 4.4 列头菜单——汇总 ViewPipeline 各层贡献。 */
export function getColumnHeaderContextMenuItems(
  ctx: ColumnHeaderMenuContext,
  pipeline: ViewPipeline,
): readonly ContextMenuItem[]
```

列头菜单**只**包含 view layer 贡献（sort + filter），不与 cut/copy/paste 合并。

### 7.2 列头右键事件分派

`WebGridRuntime` 在 `contextmenu` 监听里：

```
if (event.y < headerHeight):
  colIndex = colsAxis.positionToIndex(event.x + scrollX)
  // 越界保护：点击在列范围之外（最后一列右侧空白）→ 不弹菜单
  if (colIndex < 0 || colIndex >= schema.fields.length): return
  field = schema.fields[colIndex]
  items = getColumnHeaderContextMenuItems({ targetKind: 'columnHeader', field, colIndex }, pipeline)
  openContextMenu(items, eventPosition)
  // 点击 sort-asc / sort-desc / sort-none → SortLayer.setSpec(...) 或 cycle
  // 点击 filter-open → openFilterPopover(field, colIndex)
  // 点击 filter-clear → FilterLayer.clear(field.id)
else:
  // 原 4.0 cell 路径
```

### 7.3 HeaderPainter 排序箭头与漏斗 icon

`HeaderPaintParams` 新增 `viewPipeline?: ViewPipeline`。绘制流程在字段名 + 网格线基础上追加：

```
for each visible column c:
  field = schema.fields[c]
  deco = pipeline.collectHeaderDecorations(field)
  if deco.sortIndicator: 绘制 theme.icons.sortAsc / sortDesc on 列头右侧 padding 区
  if deco.filterActive:  绘制 theme.icons.filter      on 列头右侧 padding 区（在排序图标左侧，若两者都有）
  字段名超长截断时，先保留 icon 区域，名字 …
```

Theme 新增（`packages/core/src/theme/Theme.ts`）：

```ts
interface ThemeIcons {
  // ...既有
  readonly sortAsc: IconDef
  readonly sortDesc: IconDef
  readonly filter: IconDef
}
```

`denseGridTheme` 用内联 SVG path 提供三个 icon（与既有 `byFieldType` 同方式）；Canvas2D 通过 `Path2D` 渲染。

### 7.4 Filter popover

新增 `packages/web/src/interaction/FilterPopover.ts`（与 4.0 context-menu 同级 DOM overlay）。

**Props**：`{ field, currentOp, onApply(op | null): void, onCancel(): void }`

**布局**（垂直从上到下）：

1. op 下拉选择器：按 `field.type` 限定可选项，默认值取 §5.2 默认 op。
2. 表单控件区（按 op 切换）：
   - `text-contains / text-equals`：`<input type="text">` + 「区分大小写」`<input type="checkbox">`
   - `number-between`：两个 `<input type="number">`（min / max）
   - `number-equals`：一个 `<input type="number">`
   - `date-between`：两个 `<input type="date">`（start / end）
   - `select-in`：列出 `schema.field.options.choices` 的所有 choice，每项 `<input type="checkbox">`
   - `checkbox-equals`：两个 radio（true / false）
   - `is-empty / is-not-empty`：无控件
3. 底部按钮：「应用」「清除」「取消」

**校验**（决定「应用」按钮是否启用）：

| op | 合法条件 |
| --- | --- |
| `text-contains` / `text-equals` | value 非空字符串 |
| `number-between` | min 或 max 至少一项是有限数 |
| `number-equals` | value 是有限数 |
| `date-between` | start 或 end 至少一项是有效 Date |
| `select-in` | values 非空 |
| `checkbox-equals` | value 已选（true / false） |
| `is-empty` / `is-not-empty` | 始终合法 |

「应用」在不合法时**禁用**（disabled）。

**定位**：锚定到对应列的左边界、`top = headerHeight`；超出 viewport 右侧时左移；超出底部时上翻（复用 4.0 popover 定位 helper）。

**关闭策略**：

- Esc / 外部点击 / 取消按钮 → `onCancel`（spec 不变）
- 应用按钮 / Enter（焦点在合法表单时）→ `onApply(op)`
- 清除按钮 → `onApply(null)`

**空 choices fallback**：当字段是 `singleSelect` / `multiSelect` 但 `field.options?.choices` 为空 / 缺失时，op 下拉里**隐藏** `select-in`，默认 op 退化为 `is-not-empty`。这样用户仍可对该列做空/非空筛选；想做 `select-in` 必须先在 schema 里补上 choices。

### 7.5 互斥规则

- 列头菜单打开 → 隐藏 fill handle、禁用 cell 菜单
- Filter popover 打开 → 隐藏 fill handle、禁用 cell 菜单 / 列头菜单
- popover 内输入获得焦点：Grid 的 keyboard handler 需 gate（新增 `isFilterPopoverOpen` 标志，与 `isContextMenuOpen` 同样位置）

---

## 8. Engine / Grid 协调

### 8.1 onViewChange 流程

`ViewPipeline.subscribe` 触发后，按 `reason` 分两条路径，统一前置步骤：

**前置（两条路径共用）**：

```
1. 若 engine.isCellEditing()：
   - 尝试 commitCellEdit()
   - 失败则 cancelCellEdit()

2. 关闭 Filter popover 与 context menu（避免指向失效列）

3. 取消 fill handle 拖拽（若存在）
```

**reason === 'spec-changed'** —— 旧数据未变，尝试按底层行重映射 selection：

```
4. 取旧 selection（anchor + active 两端）；视图坐标
5. 对每个端点：underlyingRow = oldResolveUnderlyingRow(viewRow)
6. rebuild 已完成 → newComposed = pipeline.getComposed()
7. 对每个端点：newViewRow = findViewRow(newComposed, underlyingRow)
8. 若两端都 !== -1：把 selection 平移到新坐标对 + 同 colIndex
   若任一端 === -1（被过滤掉）：清空 selection
9. invalidate frame
10. emit viewChange + 对应的 sortChange / filterChange
```

**reason === 'upstream-reset'** —— 旧 rowIndex 语义已失效，直接清空依赖 rowIndex 的状态：

```
4. 清空 selection
5. invalidate frame
6. emit viewChange（layerId 反映触发该 reset 的层；若不可判定则取 'sort'）
```

注：`setData(newSource)` 会显式清空 spec 并重建 pipeline（§3.3），其内部清空 selection 的逻辑独立于 subscribe 回调，不依赖 'upstream-reset' 路径。

### 8.2 Undo 命令的底层坐标存储

`CellWrite.rowIndex` 4.4 起含义改为**底层坐标**。

**生成命令时**（`commitCellEdit / commitPaste / commitFill / clearRange`）：

```ts
// 修改前
writes.push({ rowIndex: viewRow, fieldId, value })

// 修改后
const underlyingRow = resolveUnderlyingRow(this.data, viewRow)
writes.push({ rowIndex: underlyingRow, fieldId, value })
```

**undo / redo 执行时**：

```ts
for (const w of cmd.writes) {
  const viewRow = findViewRow(this.data, w.rowIndex)
  if (viewRow === -1) {
    // 行当前被过滤掉
    if (this.data.updateCellByUnderlyingRow) {
      this.data.updateCellByUnderlyingRow(w.rowIndex, w.fieldId, w.value)
    } else {
      // identity 情况下二者等价
      this.data.updateCell(w.rowIndex, w.fieldId, w.value)
    }
  } else {
    this.data.updateCell(viewRow, w.fieldId, w.value)
  }
}
```

undo 后选区重定位：对每个被写的底层 rowIndex 算 `findViewRow`；找到任意一行可见 → 把 selection 平移到该范围；全部不可见 → selection 保持不变。

### 8.3 失败模式

| 情况 | 处理 |
| --- | --- |
| `SortLayer.spec.fieldId` 在 schemaChanged 后不存在 | `setSpec(null)` + emit reset |
| `FilterLayer.spec.fieldId` 不存在 / op 与新 type 不兼容 | `setSpec(null)` + emit reset |
| undo 命令的 fieldId 在 schemaChanged 后不存在 | 该写入静默跳过（4.2 既有 fallback） |
| undo 命令的底层 rowIndex 越界（外部 `setRows` 后行数变少） | 该写入跳过 |
| Filter 把整表过滤为 0 行 | composed.getRowCount() === 0；renderer 进入 empty state；selection 清空 |

### 8.4 公开事件

```ts
grid.on('viewChange',   (e: { layerId: 'sort' | 'filter' }) => void)
grid.on('sortChange',   (e: { spec: SortSpec | null })      => void)
grid.on('filterChange', (e: { spec: FilterSpec | null })    => void)
```

三种事件同时暴露：`viewChange` 合事件 + 各 layer 自己的分事件，消费者按需订阅。

### 8.5 与 4.3 fill handle 的衔接

- fill handle 的 source / fill / result range 全部使用视图坐标（4.3 现有行为不变）。
- `engine.commitFill` 内部生成的 writes 按 §8.2 翻译为底层坐标。
- 视图变化（spec 切换）时强制 cancel 正在进行的 fill 拖拽。

---

## 9. 测试策略

### 9.1 单元测试矩阵

| 模块 | 关键测试用例 |
| --- | --- |
| `SortLayer.wrap` | text/number/date/checkbox/singleSelect 各 asc/desc/null 末尾断言；stable sort；多次 setSpec 顺序正确；multiSelect 被拒 |
| `FilterLayer.wrap` | 每个 FilterOp 至少 3 行覆盖（命中/未命中/空值）；schemaChanged 失效 spec 降级；rowsChanged 不重过滤 |
| `ViewPipeline` 套娃 | filter→sort 后 getCell 数据正确；`resolveUnderlyingRow / findViewRow` 双射 invariant；spec 变化触发 subscribe；oldResolveUnderlyingRow 在 subscribe 回调中可用 |
| `MutableDataSource.updateCellByUnderlyingRow` | 装饰源透传到上游；被过滤行可写底层；无 updateCellByUnderlyingRow 的源走 fallback |
| `ContextMenuModel.getColumnHeaderContextMenuItems` | sort 三态 checked；filter 激活时「清除」启用；multiSelect 列上 sort 全禁用 |
| `DefaultGridEngine` 视图协调 | view 切换后 selection 重定位 / 清空各分支；undo 命令 rowIndex 翻译；undo 命中已过滤行的 fallback 路径 |
| `FilterPopover` 表单 | 各 op 的「应用」按钮启用 / 禁用条件；Esc / 外部点击 / Apply / Clear / Cancel 五条路径 |

### 9.2 集成测试（`packages/web/tests`）

- 列头右键 → 升序 → canvas 重绘后第一行变化 + sortAsc icon 出现
- 列头右键 → 筛选... → popover 弹出 → 输入 text-contains → Apply → rowCount 变化 + filter icon 激活
- 排序激活时编辑一 cell：该行**不**重排
- 筛选激活时编辑一 cell 使其不再匹配：该行**仍可见**
- 选定 (viewRow=5) → 切换排序 → selection 跟随同一底层行平移
- 编辑中切换筛选导致该行被过滤掉：编辑被强制 commit、selection 清空；切回原 spec 后值仍正确
- 写入 → 切换排序 → undo → 视图坐标正确还原

### 9.3 Storybook（`apps/storybook/src/stories/4-sort-filter/`）

- `sort-basic.stories.ts`：每个 FieldType 一个排序演示
- `sort-stability.stories.ts`：同值多行验证稳定排序
- `filter-text.stories.ts`：contains / equals / is-empty
- `filter-number.stories.ts`：between / equals
- `filter-date.stories.ts`：date-between
- `filter-select.stories.ts`：singleSelect / multiSelect select-in
- `filter-checkbox.stories.ts`：checkbox-equals
- `view-pipeline-combined.stories.ts`：filter+sort 同时激活
- `view-with-fill.stories.ts`：filter 激活后用 fill handle 填充
- `view-with-undo.stories.ts`：写入 → 切换排序 → undo

### 9.4 性能基线（非 PR gate）

- 100k 行 InMemory，sort spec 切换 ≤ 200ms
- 100k 行 filter → 视图 1k 行，编辑一个 cell 后 rowsChanged 不触发重排 / 重过滤

---

## 10. Out of Scope 与未来 hook

| 项 | 状态 | 后续位置 |
| --- | --- | --- |
| 多列复合排序（Shift+Click） | 不交付 | Phase 5+：`SortLayer.setSpec` 改为 `readonly SortSpec[]`；菜单加「添加第二排序键」 |
| 多列同时筛选（AND/OR） | 不交付 | Phase 5+：`FilterLayer.setSpec` 改为 `readonly FilterSpec[]` |
| Excel 风格 distinct 按值勾选（text 列） | 不交付 | FilterLayer 加 `op: { kind: 'in-set'; values }` + UI 增加 distinct 模式 |
| 自定义 predicate / 外部插件注册 | 不交付 | `ViewPipeline.add()` 开放为 public API；定义插件注册流程 |
| 服务端排序 / 筛选 | 不交付 | Phase 5+：`@novasheet/server-source` 实现 `ViewLayer`，spec 下推 |
| 分组 / 透视（grouping / pivot） | 不交付 | Phase 6+：新增 `GroupLayer`；`resolveUnderlyingRow` 返回 -1 表示聚合行 |
| 列头 DOM overlay 层（点击命中 / hover effect） | 不交付 | Phase 4.5 列拖拽重排时引入 |
| 行号列上的筛选 / 排序入口 | 不交付 | 仅顶部列头支持右键菜单 |
| 持久化 view 状态到 storage | 不交付 | Grid 消费者自行用事件保存 / 恢复 |

### 10.1 协议演进保证

- `headerDecoration` 与 `contextMenuItems` 现在返回纯数据结构；未来加新装饰类型（如「列宽自适应锁」「列固定」）时增字段不破坏旧 layer。
- `wrap` 的 `upstream → DataSource` 签名足够泛——grouping layer 未来返回的 DataSource 的 `getRowCount` 包含聚合行；`resolveUnderlyingRow(viewRow) === -1` 识别非数据行，引擎不需改逻辑。
- `MutableDataSource.updateCellByUnderlyingRow` 是 4.4 加的 optional；4.5 行插入 / 删除若需稳定 row id 而非 rowIndex，再演进到 `updateCellByRowKey(key)`。

---

## 11. ADR 影响

本 spec 与 CLAUDE.md「Locked architectural decisions」的关系：

| ADR | 是否影响 | 说明 |
| --- | --- | --- |
| §A.1 单 Canvas 全可见区重绘 | 不影响 | Renderer 只多绘两种 icon |
| §A.2 原生滚动 + 非线性 scrollTop | 不影响 | view 切换会引起总行数变化 → ScrollMapper 重算 spacer，复用 4.2 既有路径 |
| §A.3 ChunkedAxis | 不影响 | 行数变化时 Grid 已有 `setRowCount` 重建路径 |
| §A.4 DataSource 接口契约 | **小幅修订** | 新增两个 optional 方法，向后兼容；`endIndex INCLUSIVE` 不变 |
| §A.5 Theme 是唯一视觉源 | 不影响 | 新 icon 走 `theme.icons` |
| §A.6 DOM `<handle-layer>` siblings | 不影响 | Filter popover 复用 4.0 popover 层 |
| §A.7 Per-Grid FrameScheduler | 不影响 | 不引入新 RAF 源 |
