import type {
  CellAddress,
  CellRange,
  GridSelection,
  SelectCellOptions,
} from './SelectionTypes'
import type {
  GridIndexBounds,
  SelectionMergeLookup,
  SelectionNavigationIntent,
} from './SelectionNavigation'
import { applySelectionNavigation } from './SelectionNavigation'
import {
  remapColIndexAfterDelete,
  remapColIndexAfterInsert,
  remapRowIndexAfterDelete,
  remapRowIndexAfterInsert,
} from '../../coords/remap'
import {
  remapSelectionAfterViewRowsChanged,
  remapSelectionByRowIndexMap,
  remapSelectionByVisibleFieldIds,
} from './SelectionRules'
import type { SelectionState } from './SelectionState'

const EMPTY_SELECTION: GridSelection = {
  activeCell: null,
  anchorCell: null,
  extentCell: null,
  selectedRange: null,
}

/** 默认 selection 聚合根；向 engine 暴露选择状态与结构 remap 能力。 */
export class DefaultSelectionState implements SelectionState {
  /** 当前选区快照；空选区四个字段必须同时为 `null`。 */
  private selection: GridSelection = EMPTY_SELECTION
  /** column move 前的可见 fieldId 顺序，用于 event 后把 view col 选区恢复到同一字段。 */
  private visibleFieldIdsBefore: readonly string[] | null = null

  /** 返回当前不可变选区快照；调用方不得原地修改返回对象。 */
  getSelection(): GridSelection {
    return this.selection
  }

  /** 设置完整选区快照，并校验 active/anchor/extent/range 的一致性。 */
  setSelection(selection: GridSelection): void {
    const cells = [selection.activeCell, selection.anchorCell, selection.extentCell]
    const hasAnyCell = cells.some((cell) => cell !== null)
    const hasEveryCell = cells.every((cell) => cell !== null)
    if (!hasAnyCell) {
      if (selection.selectedRange !== null) {
        throw new Error('DefaultSelectionState.setSelection: empty selection cannot include a range')
      }
      this.selection = EMPTY_SELECTION
      return
    }
    if (!hasEveryCell || selection.selectedRange === null) {
      throw new Error('DefaultSelectionState.setSelection: non-empty selection requires all endpoints')
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
      throw new Error('DefaultSelectionState.setSelection: selectedRange must match anchor and extent')
    }

    this.selection = selection
  }

  /** 选择单元格；`extend=true` 时保留原 anchor/active，只移动 extent。 */
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

  /** 清空选区，恢复为统一的空选区对象。 */
  clear(): void {
    this.selection = EMPTY_SELECTION
  }

  /** 以矩形 range 建立选区；active/anchor 固定为 range 左上角。 */
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

  /** 应用键盘导航 intent，并返回移动后的 active/extent cell 供滚动跟随。 */
  navigate(
    intent: SelectionNavigationIntent,
    bounds: GridIndexBounds,
    merge?: SelectionMergeLookup,
  ): CellAddress | null {
    return applySelectionNavigation(this, intent, bounds, merge)
  }

  /** 行插入后平移已有选区；空选区保持不变。 */
  remapAfterRowsInserted(at: number, count: number): void {
    if (this.selection.selectedRange == null) return
    const shift = (rowIndex: number) => remapRowIndexAfterInsert(rowIndex, at, count)
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

  /** 行删除后收缩已有选区；选区覆盖的行全部删除时清空。 */
  remapAfterRowsDeleted(rowIds: readonly number[]): void {
    if (this.selection.selectedRange == null) return
    const range = this.selection.selectedRange
    const survivors: number[] = []
    for (let rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex += 1) {
      const mapped = remapRowIndexAfterDelete(rowIndex, rowIds)
      if (mapped !== null) survivors.push(mapped)
    }
    if (survivors.length === 0) {
      this.selection = EMPTY_SELECTION
      return
    }
    const startRow = survivors[0]!
    const endRow = survivors[survivors.length - 1]!
    const remap = (cell: CellAddress | null) => {
      if (cell == null) return null
      const mapped = remapRowIndexAfterDelete(cell.rowIndex, rowIds)
      // 端点行被删时落到它塌缩后应处的位置并夹入存活范围,保持选区方向，
      // 避免端点统一塌到 startRow 而与重算的 selectedRange 不一致。
      const rowIndex =
        mapped ?? clampToRange(collapsedIndex(cell.rowIndex, rowIds), startRow, endRow)
      return { ...cell, rowIndex }
    }
    this.selection = {
      activeCell: remap(this.selection.activeCell),
      anchorCell: remap(this.selection.anchorCell),
      extentCell: remap(this.selection.extentCell),
      selectedRange: { ...range, startRow, endRow },
    }
  }

  /** 列插入后平移已有选区；空选区保持不变。 */
  remapAfterColsInserted(at: number, count: number): void {
    if (this.selection.selectedRange == null) return
    const shift = (colIndex: number) => remapColIndexAfterInsert(colIndex, at, count)
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

  /** 列删除后收缩已有选区；选区覆盖的列全部删除时清空。 */
  remapAfterColsDeleted(colIndices: readonly number[]): void {
    if (this.selection.selectedRange == null) return
    const range = this.selection.selectedRange
    const survivors: number[] = []
    for (let colIndex = range.startCol; colIndex <= range.endCol; colIndex += 1) {
      const mapped = remapColIndexAfterDelete(colIndex, colIndices)
      if (mapped !== null) survivors.push(mapped)
    }
    if (survivors.length === 0) {
      this.selection = EMPTY_SELECTION
      return
    }
    const startCol = survivors[0]!
    const endCol = survivors[survivors.length - 1]!
    const remap = (cell: CellAddress | null) => {
      if (cell == null) return null
      const mapped = remapColIndexAfterDelete(cell.colIndex, colIndices)
      const colIndex =
        mapped ?? clampToRange(collapsedIndex(cell.colIndex, colIndices), startCol, endCol)
      return { ...cell, colIndex }
    }
    this.selection = {
      activeCell: remap(this.selection.activeCell),
      anchorCell: remap(this.selection.anchorCell),
      extentCell: remap(this.selection.extentCell),
      selectedRange: { ...range, startCol, endCol },
    }
  }

  /** row move 后按 old-row-index → new-row-index 映射恢复同一底层行选区。 */
  restoreByRowIndexMap(indexMap: ReadonlyMap<number, number>): void {
    this.setSelection(remapSelectionByRowIndexMap(this.getSelection(), indexMap))
  }

  /** 捕获结构变化前的可见字段顺序；必须在 column move operation 执行前调用。 */
  captureVisibleFieldIdsBefore(fieldIds: readonly string[]): void {
    this.visibleFieldIdsBefore = [...fieldIds]
  }

  /** 使用捕获的旧字段顺序和当前字段顺序，把列选区恢复到同一字段集合。 */
  restoreByCapturedVisibleFieldIds(currentFieldIds: readonly string[]): void {
    if (!this.visibleFieldIdsBefore) return
    this.setSelection(
      remapSelectionByVisibleFieldIds(
        this.getSelection(),
        this.visibleFieldIdsBefore,
        currentFieldIds,
      ),
    )
    this.visibleFieldIdsBefore = null
  }

  /** sort/filter 等 view-row 映射变化后，按 raw row 身份恢复选区。 */
  remapAfterViewRowsChanged(context: {
    oldViewRowToRaw(viewRow: number): number
    rawRowToView(rawRow: number): number
  }): void {
    this.setSelection(remapSelectionAfterViewRowsChanged(this.getSelection(), context))
  }
}

/** 被删索引塌缩后应处的位置：减去严格小于它的删除数量（`removedSorted` 升序）。 */
function collapsedIndex(index: number, removedSorted: readonly number[]): number {
  let shift = 0
  for (const removed of removedSorted) {
    if (removed < index) shift += 1
    else break
  }
  return index - shift
}

function clampToRange(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function normalizeRange(a: CellAddress, b: CellAddress): CellRange {
  return {
    startRow: Math.min(a.rowIndex, b.rowIndex),
    endRow: Math.max(a.rowIndex, b.rowIndex),
    startCol: Math.min(a.colIndex, b.colIndex),
    endCol: Math.max(a.colIndex, b.colIndex),
  }
}
