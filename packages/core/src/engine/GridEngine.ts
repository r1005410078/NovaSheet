/**
 * 平台无关引擎契约（spec §5 `GridEngine`）。
 *
 * 持有数据、主题、行列轴、冻结区、viewport 与逻辑滚动；不含 DOM / canvas。
 */

import type { DataSource } from '../data/DataSource'
import type { Field } from '../data/Schema'
import type { RemovedFieldSnapshot } from '../data/MutableDataSource'
import type { CellWrite, UndoCommand } from '../undo/UndoCommand'
import type { BorderPreset, BorderStyle, CellFormat, TextWrapMode } from '../format/CellFormat'
import type { MergeRegion } from '../merge/MergeStore'
import type { ApplyPasteSource, PasteTargetRect } from '../clipboard/ApplyPaste'
import type { PasteSkippedCell } from '../clipboard/types'
import type { FillDirection, FillMergeSnap } from '../fill/FillTarget'
import type {
  CellAddress,
  CellRange,
  GridSelection,
  SelectCellOptions,
} from '../interaction/SelectionModel'
import type { Axis } from '../layout/ChunkedAxis'
import type { FrozenConfig } from '../layout/FrozenRegions'
import type { Viewport } from '../layout/Viewport'
import type { RenderFrame } from '../render/RenderFrame'
import type { Theme } from '../theme/Theme'

/** `DefaultGridEngine` 构造参数。 */
export interface GridEngineOptions {
  data: DataSource
  theme?: Theme
  /** 推荐的新冻结配置：支持顶部、左侧、右侧冻结。 */
  frozen?: Partial<FrozenConfig>
  /** 兼容旧 API：等价于 `frozen.topRows`。新代码优先使用 `frozen`。 */
  frozenRows?: number
  /** 兼容旧 API：等价于 `frozen.leftCols`。新代码优先使用 `frozen`。 */
  frozenCols?: number
  defaultRowHeight?: number
  /** Excel 风格：列头显示 A/B/…、左侧显示 1-based 行号。 */
  excelHeaders?: boolean
}

export interface FillCommitResult {
  readonly source: CellRange
  readonly fill: CellRange
  readonly result: CellRange
  readonly writes: readonly CellWrite[]
}

export interface SetViewDataOptions {
  readonly oldResolveUnderlyingRow?: (viewRow: number) => number
  readonly clearSelection?: boolean
}

export interface GridEngine {
  setData(data: DataSource): void
  setViewData(data: DataSource, options?: SetViewDataOptions): void
  setTheme(theme: Theme): void
  setFrozen(config: Partial<FrozenConfig>): void
  setFrozen(rows: number, cols: number): void
  setViewportSize(width: number, height: number): void
  setHeaderHeight(headerHeight: number): void
  setScroll(logicalX: number, logicalY: number): void
  getRowHeight(rowIndex: number): number
  setRowHeight(rowIndex: number, height: number): void
  setColumnWidth(fieldId: string, width: number): void
  selectCell(cell: CellAddress, options?: SelectCellOptions): void
  /** Phase 3.3 — 键盘导航；识别按键则更新选区并返回 true。 */
  navigateSelection(key: string, shiftKey: boolean): boolean
  /** Phase 3.5 — 进入编辑；不可编辑格返回 false。 */
  beginCellEdit(cell: CellAddress): boolean
  updateCellEditDraft(draft: string): void
  cancelCellEdit(): void
  /** 提交编辑；非法输入返回 false。 */
  commitCellEdit(): boolean
  isCellEditing(): boolean
  /** Phase 4.1 — 把 `range` 内每个 cell 置 null；非 MutableDataSource 静默 no-op。 */
  clearRange(range: CellRange): void
  clearSelection(): void
  getFrame(): RenderFrame
  getSelection(): GridSelection
  getRowsTotalSize(): number
  getColsTotalSize(): number
  getColumnIndex(fieldId: string): number
  getTheme(): Theme
  getRowsAxis(): Axis
  getColsAxis(): Axis
  getViewport(): Viewport
  getData(): DataSource

  /** Phase 4.2 — undo/redo */
  undo(): UndoCommand | undefined
  redo(): UndoCommand | undefined
  canUndo(): boolean
  canRedo(): boolean

  /** Phase 4.2 — 提交一次列宽调整为 1 步 undo;before === after 时不入栈。 */
  commitColumnResize(colIndex: number, oldWidth: number, newWidth: number): void

  /** Phase 4.2 — 提交一次行高调整为 1 步 undo;before === after 时不入栈。 */
  commitRowResize(rowIndex: number, oldHeight: number, newHeight: number): void

  /** Phase 4.2 — 提交一次粘贴为 1 步 undo;无写入(全跳过)时不入栈。 */
  commitPaste(
    source: ApplyPasteSource,
    target: PasteTargetRect,
    fieldIdsAtCols: readonly string[],
    onSkipped?: (cells: readonly PasteSkippedCell[]) => void,
  ): void

  /** Phase 4.3 — 提交一次填充柄写入为 1 步 undo;无写入时返回 null。 */
  commitFill(source: CellRange, fill: CellRange, direction: FillDirection): FillCommitResult | null

  /**
   * Phase 5-A — 返回 view `source` 选区的合并块吸附尺寸（供 `computeFillTarget` 吸附整块）。
   * source 含合并时返回其行/列跨度，否则返回 `{ rowSpan: 1, colSpan: 1 }`（不吸附）。
   */
  getFillMergeSnap(source: CellRange): FillMergeSnap

  /** Phase 4.5 — 将指定底层行 ID 列表从隐藏集移除并触发 invalidate。 */
  unhideRows(underlyingRowIds: readonly number[]): void

  /** Phase 4.5 — 返回当前隐藏行的 underlying row id 升序数组。 */
  getHiddenRows(): readonly number[]

  /** Phase 4.5 — 在 beforeUnderlyingRow 位置前插入 count 空白行；DataSource 不可写时返回空数组。 */
  insertRows(beforeUnderlyingRow: number, count: number): readonly number[]

  /** Phase 4.5 — 删除给定 underlying row id 集合（调用方保证升序、去重）。 */
  deleteRows(underlyingRowIds: readonly number[]): void

  /** Phase 4.5 — 隐藏给定 underlying row id 集合。 */
  hideRows(underlyingRowIds: readonly number[]): void

  /** Phase 4.5 — 批量将多行高度设置为同一值 h，并入 undo 栈。 */
  setRowHeights(rowIds: readonly number[], h: number): void

  /** Phase 4.7 follow-up — 移动连续行组；`beforeRowId=null` 表示移动到末尾。 */
  moveRows(rowIds: readonly number[], beforeRowId: number | null): boolean

  /** Phase 4.5 — 程序化设置选区。 */
  setSelection(selection: GridSelection): void

  /** Phase 4.6 — 在 schema field index 位置前插入 count 个列字段。 */
  insertCols(beforeFieldIndex: number, count: number): readonly Field[]

  /** Phase 4.6 — 按 fieldId 删除列字段，返回删除快照。 */
  deleteCols(fieldIds: readonly string[]): readonly RemovedFieldSnapshot[]

  /** Phase 4.6 — 隐藏给定 fieldId 集合。 */
  hideCols(fieldIds: readonly string[]): void

  /** Phase 4.6 — 取消隐藏给定 fieldId 集合。 */
  unhideCols(fieldIds: readonly string[]): void

  /** Phase 4.6 — 批量设置多列宽度。 */
  setColumnWidths(fieldIds: readonly string[], widthPx: number): void

  /** Phase 4.6 — 返回当前隐藏列 fieldId，按 schema 顺序排序。 */
  getHiddenCols(): readonly string[]

  /** Phase 4.6 — 返回当前冻结配置快照。 */
  getFrozenConfig(): FrozenConfig

  /** Phase 4.7 — 按 fieldId 移动列组；`beforeFieldId=null` 表示移动到末尾。 */
  moveCols(fieldIds: readonly string[], beforeFieldId: string | null): boolean

  /**
   * Phase 5-A — 为 view `range` 设置填充色；`color=null` 清除填充。
   * 仅在格式实际变化时入 undo 栈并返回 true。
   * `range` 必须已归一化（`startRow ≤ endRow`，`startCol ≤ endCol`）。
   */
  setFillColor(range: CellRange, color: string | null): boolean

  /**
   * Phase 5-A — 为 view `range` 设置基础边框；`preset='clear'` 需 `border=null`。
   * 非 solid 线型在 5-A 返回 false；仅在格式实际变化时入栈并返回 true。
   * `range` 必须已归一化（`startRow ≤ endRow`，`startCol ≤ endCol`）。
   */
  setBorders(range: CellRange, preset: BorderPreset, border: BorderStyle | null): boolean

  /** 设置 view `range` 的文本显示模式（overflow/wrap/clip）；非连续映射返回 false。 */
  setTextWrap(range: CellRange, mode: TextWrapMode): boolean

  /** Phase 5-A — 解析单个单元格格式（raw 坐标）；无格式返回 undefined。 */
  getCellFormat(rowIndex: number, colIndex: number): CellFormat | undefined

  /**
   * Phase 5-A — 合并 view `range`；单格 / 重叠现存合并 / 排序筛选下非连续映射时返回 false。
   * 成功时选中整个合并 view 范围并入 undo 栈。
   * `range` 必须已归一化（`startRow ≤ endRow`，`startCol ≤ endCol`）。
   */
  mergeCells(range: CellRange): boolean

  /**
   * Phase 5-A — 取消 view `range` 触及的所有合并区域；移除任何区域则入栈并返回 true。
   * 排序筛选下非连续映射或无区域触及时返回 false。
   */
  unmergeCells(range: CellRange): boolean

  /** Phase 5-A — 返回覆盖单元格的合并区域（**raw 坐标**，与 `getCellFormat` 一致）；无则返回 null。 */
  getMergeRegion(rowIndex: number, colIndex: number): MergeRegion | null
}
