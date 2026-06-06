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
  readonly extend?: boolean
}
