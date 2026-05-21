/**
 * 平台无关引擎契约（spec §5 `GridEngine`）。
 *
 * 持有数据、主题、行列轴、冻结区、viewport 与逻辑滚动；不含 DOM / canvas。
 */

import type { DataSource } from '../data/DataSource'
import type { CellWrite, UndoCommand } from '../undo/UndoCommand'
import type { ApplyPasteSource, PasteTargetRect } from '../clipboard/ApplyPaste'
import type { PasteSkippedCell } from '../clipboard/types'
import type { FillDirection } from '../fill/FillTarget'
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

export interface GridEngine {
  setData(data: DataSource): void
  setTheme(theme: Theme): void
  setFrozen(config: Partial<FrozenConfig>): void
  setFrozen(rows: number, cols: number): void
  setViewportSize(width: number, height: number): void
  setHeaderHeight(headerHeight: number): void
  setScroll(logicalX: number, logicalY: number): void
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
}
