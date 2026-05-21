/**
 * Phase 3.1 的选择状态模型。
 *
 * 这里先只表达“当前活动单元格 + 一个矩形选区”。后续 Shift 扩展、拖拽框选、
 * 键盘导航都复用同一份状态，不让 web / renderer 各自维护一套选择概念。
 */

import type { GridIndexBounds, SelectionNavigationIntent } from './SelectionNavigation'
import { applySelectionNavigation } from './SelectionNavigation'

export interface CellAddress {
  readonly rowIndex: number
  readonly colIndex: number
}

export interface CellRange {
  readonly startRow: number
  readonly endRow: number
  readonly startCol: number
  readonly endCol: number
}

export interface GridSelection {
  readonly activeCell: CellAddress | null
  readonly anchorCell: CellAddress | null
  readonly extentCell: CellAddress | null
  readonly selectedRange: CellRange | null
}

export interface SelectCellOptions {
  /**
   * 是否从 anchorCell 扩展到目标单元格。
   * Phase 3.1 先把状态语义建好；Phase 3.2 的 Shift / 拖拽选择会正式使用它。
   */
  readonly extend?: boolean
}

const EMPTY_SELECTION: GridSelection = {
  activeCell: null,
  anchorCell: null,
  extentCell: null,
  selectedRange: null,
}

export class SelectionModel {
  private selection: GridSelection = EMPTY_SELECTION

  getSelection(): GridSelection {
    return this.selection
  }

  selectCell(cell: CellAddress, options: SelectCellOptions = {}): void {
    const isExtending = options.extend && this.selection.anchorCell && this.selection.activeCell
    const active = isExtending ? this.selection.activeCell! : cell
    const anchor = isExtending ? this.selection.anchorCell! : cell
    const extent = cell
    this.selection = {
      activeCell: active,
      anchorCell: anchor,
      extentCell: extent,
      selectedRange: normalizeRange(anchor, extent),
    }
  }

  clear(): void {
    this.selection = EMPTY_SELECTION
  }

  /** Phase 4.2 — undo/redo 恢复矩形选区。 */
  setSelectedRange(range: CellRange): void {
    const anchor: CellAddress = { rowIndex: range.startRow, colIndex: range.startCol }
    const extent: CellAddress = { rowIndex: range.endRow, colIndex: range.endCol }
    this.selection = {
      activeCell: anchor,
      anchorCell: anchor,
      extentCell: extent,
      selectedRange: normalizeRange(anchor, extent),
    }
  }

  /** Phase 3.3 — 键盘导航；返回移动后的焦点格（用于滚动跟随）。 */
  navigate(intent: SelectionNavigationIntent, bounds: GridIndexBounds): CellAddress | null {
    return applySelectionNavigation(this, intent, bounds)
  }
}

function normalizeRange(a: CellAddress, b: CellAddress): CellRange {
  return {
    startRow: Math.min(a.rowIndex, b.rowIndex),
    endRow: Math.max(a.rowIndex, b.rowIndex),
    startCol: Math.min(a.colIndex, b.colIndex),
    endCol: Math.max(a.colIndex, b.colIndex),
  }
}
