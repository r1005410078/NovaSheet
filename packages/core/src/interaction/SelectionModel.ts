/**
 * Phase 3.1 的选择状态模型。
 *
 * 这里先只表达“当前活动单元格 + 一个矩形选区”。后续 Shift 扩展、拖拽框选、
 * 键盘导航都复用同一份状态，不让 web / renderer 各自维护一套选择概念。
 */

import type { GridIndexBounds, SelectionNavigationIntent } from './SelectionNavigation'
import { applySelectionNavigation } from './SelectionNavigation'
import {
  remapColIndexAfterDelete,
  remapColIndexAfterInsert,
  remapRowIndexAfterDelete,
  remapRowIndexAfterInsert,
} from '../coords/remap'

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

  setSelection(selection: GridSelection): void {
    const cells = [selection.activeCell, selection.anchorCell, selection.extentCell]
    const hasAnyCell = cells.some((cell) => cell !== null)
    const hasEveryCell = cells.every((cell) => cell !== null)
    if (!hasAnyCell) {
      if (selection.selectedRange !== null) {
        throw new Error('SelectionModel.setSelection: empty selection cannot include a range')
      }
      this.selection = EMPTY_SELECTION
      return
    }
    if (!hasEveryCell || selection.selectedRange === null) {
      throw new Error('SelectionModel.setSelection: non-empty selection requires all endpoints')
    }

    const anchor = selection.anchorCell!
    const extent = selection.extentCell!
    const normalizedRange = normalizeRange(anchor, extent)
    if (
      selection.selectedRange.startRow !== normalizedRange.startRow ||
      selection.selectedRange.endRow !== normalizedRange.endRow ||
      selection.selectedRange.startCol !== normalizedRange.startCol ||
      selection.selectedRange.endCol !== normalizedRange.endCol
    ) {
      throw new Error('SelectionModel.setSelection: selectedRange must match anchor and extent')
    }

    this.selection = selection
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

  /** 把整个选区矩形(active + anchor + extent + selectedRange)对齐到给定 range。 */
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

  /** Phase 4.5 — 插入行后平移选区；委托给 `coords/remap.ts`。 */
  remapAfterRowsInserted(at: number, count: number): void {
    if (this.selection.selectedRange == null) return
    const shift = (r: number) => remapRowIndexAfterInsert(r, at, count)
    const range = this.selection.selectedRange
    this.selection = {
      activeCell: this.selection.activeCell
        ? { ...this.selection.activeCell, rowIndex: shift(this.selection.activeCell.rowIndex) }
        : null,
      anchorCell: this.selection.anchorCell
        ? { ...this.selection.anchorCell, rowIndex: shift(this.selection.anchorCell.rowIndex) }
        : null,
      extentCell: this.selection.extentCell
        ? { ...this.selection.extentCell, rowIndex: shift(this.selection.extentCell.rowIndex) }
        : null,
      selectedRange: { ...range, startRow: shift(range.startRow), endRow: shift(range.endRow) },
    }
  }

  /**
   * Phase 4.5 — 删除行后收缩选区。委托给 `coords/remap.ts`；该函数对被删行返回 null。
   * removedSorted 必须升序。整 range 全部被删 → clear；否则折叠到首/末存活行。
   */
  remapAfterRowsDeleted(removedSorted: readonly number[]): void {
    if (this.selection.selectedRange == null) return
    const range = this.selection.selectedRange
    const survivors: number[] = []
    for (let r = range.startRow; r <= range.endRow; r += 1) {
      const mapped = remapRowIndexAfterDelete(r, removedSorted)
      if (mapped !== null) survivors.push(mapped)
    }
    if (survivors.length === 0) {
      this.selection = { activeCell: null, anchorCell: null, extentCell: null, selectedRange: null }
      return
    }
    const startRow = survivors[0]!
    const endRow = survivors[survivors.length - 1]!
    const remap = (cell: { rowIndex: number; colIndex: number } | null) => {
      if (cell == null) return null
      const mapped = remapRowIndexAfterDelete(cell.rowIndex, removedSorted)
      return { ...cell, rowIndex: mapped ?? startRow }
    }
    this.selection = {
      activeCell: remap(this.selection.activeCell),
      anchorCell: remap(this.selection.anchorCell),
      extentCell: remap(this.selection.extentCell),
      selectedRange: { ...range, startRow, endRow },
    }
  }

  /** Phase 4.6 — 插入列后平移选区；委托给 `coords/remap.ts`。 */
  remapAfterColsInserted(at: number, count: number): void {
    if (this.selection.selectedRange == null) return
    const shift = (c: number) => remapColIndexAfterInsert(c, at, count)
    const range = this.selection.selectedRange
    this.selection = {
      activeCell: this.selection.activeCell
        ? { ...this.selection.activeCell, colIndex: shift(this.selection.activeCell.colIndex) }
        : null,
      anchorCell: this.selection.anchorCell
        ? { ...this.selection.anchorCell, colIndex: shift(this.selection.anchorCell.colIndex) }
        : null,
      extentCell: this.selection.extentCell
        ? { ...this.selection.extentCell, colIndex: shift(this.selection.extentCell.colIndex) }
        : null,
      selectedRange: { ...range, startCol: shift(range.startCol), endCol: shift(range.endCol) },
    }
  }

  /**
   * Phase 4.6 — 删除列后收缩选区。removedSorted 必须升序。
   * 整 range 全部被删 → clear；否则折叠到首/末存活列。
   */
  remapAfterColsDeleted(removedSorted: readonly number[]): void {
    if (this.selection.selectedRange == null) return
    const range = this.selection.selectedRange
    const survivors: number[] = []
    for (let c = range.startCol; c <= range.endCol; c += 1) {
      const mapped = remapColIndexAfterDelete(c, removedSorted)
      if (mapped !== null) survivors.push(mapped)
    }
    if (survivors.length === 0) {
      this.selection = { activeCell: null, anchorCell: null, extentCell: null, selectedRange: null }
      return
    }
    const startCol = survivors[0]!
    const endCol = survivors[survivors.length - 1]!
    const remap = (cell: { rowIndex: number; colIndex: number } | null) => {
      if (cell == null) return null
      const mapped = remapColIndexAfterDelete(cell.colIndex, removedSorted)
      return { ...cell, colIndex: mapped ?? startCol }
    }
    this.selection = {
      activeCell: remap(this.selection.activeCell),
      anchorCell: remap(this.selection.anchorCell),
      extentCell: remap(this.selection.extentCell),
      selectedRange: { ...range, startCol, endCol },
    }
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
