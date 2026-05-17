/**
 * 平台无关引擎契约（spec §5 `GridEngine`）。
 *
 * 持有数据、主题、行列轴、冻结区、viewport 与逻辑滚动；不含 DOM / canvas。
 */

import type { DataSource } from '../data/DataSource'
import type {
  CellAddress,
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
}
