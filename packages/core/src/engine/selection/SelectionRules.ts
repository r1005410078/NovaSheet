import type {
  CellAddress,
  CellRange,
  GridSelection,
} from './SelectionTypes'

const EMPTY_SELECTION: GridSelection = {
  activeCell: null,
  anchorCell: null,
  extentCell: null,
  selectedRange: null,
}

/** 视图行变化前后的显式映射能力；selection remap 不读取 engine 活状态。 */
export interface ViewRowSelectionRemapContext {
  oldViewRowToRaw(viewRow: number): number
  rawRowToView(rawRow: number): number
}

/** 在 sort/filter/view data 替换后，按 raw row 身份恢复 view selection。 */
export function remapSelectionAfterViewRowsChanged(
  selection: GridSelection,
  context: ViewRowSelectionRemapContext,
): GridSelection {
  if (!isCompleteSelection(selection)) return EMPTY_SELECTION

  const activeCell = remapViewRowCell(selection.activeCell, context)
  if (!activeCell) return EMPTY_SELECTION

  if (isSingleCellRange(selection.selectedRange)) {
    return cellSelection(activeCell)
  }

  const anchorCell = remapViewRowCell(selection.anchorCell, context)
  const extentCell = remapViewRowCell(selection.extentCell, context)
  const remappedRows = remapSelectedRows(selection.selectedRange, context)

  if (
    anchorCell &&
    extentCell &&
    remappedRows &&
    areContiguousRows(remappedRows) &&
    selection.selectedRange.endRow - selection.selectedRange.startRow ===
      Math.max(...remappedRows) - Math.min(...remappedRows)
  ) {
    const range = {
      startRow: Math.min(...remappedRows),
      endRow: Math.max(...remappedRows),
      startCol: selection.selectedRange.startCol,
      endCol: selection.selectedRange.endCol,
    }
    return {
      activeCell,
      anchorCell: { rowIndex: range.startRow, colIndex: range.startCol },
      extentCell: { rowIndex: range.endRow, colIndex: range.endCol },
      selectedRange: range,
    }
  }

  return cellSelection(activeCell)
}

/** 按 old row index → new row index map 恢复移动行后的选区。 */
export function remapSelectionByRowIndexMap(
  selection: GridSelection,
  indexMap: ReadonlyMap<number, number>,
): GridSelection {
  if (!isCompleteSelection(selection)) return EMPTY_SELECTION

  const mapCell = (cell: CellAddress): CellAddress | null => {
    const rowIndex = indexMap.get(cell.rowIndex)
    if (rowIndex === undefined) return null
    return { rowIndex, colIndex: cell.colIndex }
  }
  const activeCell = mapCell(selection.activeCell)
  const anchorCell = mapCell(selection.anchorCell)
  const extentCell = mapCell(selection.extentCell)
  if (!activeCell || !anchorCell || !extentCell) return EMPTY_SELECTION

  return {
    activeCell,
    anchorCell,
    extentCell,
    selectedRange: normalizeCellRange(anchorCell, extentCell),
  }
}

/** 按 fieldId 身份恢复移动列后的 view column selection。 */
export function remapSelectionByVisibleFieldIds(
  selection: GridSelection,
  visibleFieldIdsBefore: readonly string[],
  visibleFieldIdsAfter: readonly string[],
): GridSelection {
  if (!isCompleteSelection(selection)) return EMPTY_SELECTION

  const indexAfterById = new Map<string, number>()
  for (let i = 0; i < visibleFieldIdsAfter.length; i += 1) {
    indexAfterById.set(visibleFieldIdsAfter[i]!, i)
  }
  const mapCell = (cell: CellAddress): CellAddress | null => {
    const fieldId = visibleFieldIdsBefore[cell.colIndex]
    if (fieldId === undefined) return null
    const colIndex = indexAfterById.get(fieldId)
    if (colIndex === undefined) return null
    return { rowIndex: cell.rowIndex, colIndex }
  }

  const activeCell = mapCell(selection.activeCell)
  const anchorCell = mapCell(selection.anchorCell)
  const extentCell = mapCell(selection.extentCell)
  if (!activeCell || !anchorCell || !extentCell) return EMPTY_SELECTION

  return {
    activeCell,
    anchorCell,
    extentCell,
    selectedRange: normalizeCellRange(anchorCell, extentCell),
  }
}

function isCompleteSelection(selection: GridSelection): selection is {
  readonly activeCell: CellAddress
  readonly anchorCell: CellAddress
  readonly extentCell: CellAddress
  readonly selectedRange: CellRange
} {
  return (
    selection.activeCell !== null &&
    selection.anchorCell !== null &&
    selection.extentCell !== null &&
    selection.selectedRange !== null
  )
}

function remapViewRowCell(
  cell: CellAddress,
  context: ViewRowSelectionRemapContext,
): CellAddress | null {
  const rawRow = context.oldViewRowToRaw(cell.rowIndex)
  const viewRow = context.rawRowToView(rawRow)
  if (viewRow === -1) return null
  return { rowIndex: viewRow, colIndex: cell.colIndex }
}

function remapSelectedRows(
  range: CellRange,
  context: ViewRowSelectionRemapContext,
): number[] | null {
  const rows: number[] = []
  for (let rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex += 1) {
    const rawRow = context.oldViewRowToRaw(rowIndex)
    const viewRow = context.rawRowToView(rawRow)
    if (viewRow === -1) return null
    rows.push(viewRow)
  }
  return rows
}

function cellSelection(cell: CellAddress): GridSelection {
  return {
    activeCell: cell,
    anchorCell: cell,
    extentCell: cell,
    selectedRange: {
      startRow: cell.rowIndex,
      endRow: cell.rowIndex,
      startCol: cell.colIndex,
      endCol: cell.colIndex,
    },
  }
}

function isSingleCellRange(range: CellRange): boolean {
  return range.startRow === range.endRow && range.startCol === range.endCol
}

function areContiguousRows(rows: readonly number[]): boolean {
  const uniqueRows = new Set(rows)
  if (uniqueRows.size !== rows.length) return false
  const minRow = Math.min(...rows)
  const maxRow = Math.max(...rows)
  return maxRow - minRow + 1 === rows.length
}

function normalizeCellRange(a: CellAddress, b: CellAddress): CellRange {
  return {
    startRow: Math.min(a.rowIndex, b.rowIndex),
    endRow: Math.max(a.rowIndex, b.rowIndex),
    startCol: Math.min(a.colIndex, b.colIndex),
    endCol: Math.max(a.colIndex, b.colIndex),
  }
}
