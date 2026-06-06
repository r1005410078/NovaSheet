import type { CellValue } from '../../kernel/data/Schema'
import type { BorderPreset, BorderStyle, TextWrapMode } from '../../format/CellFormat'
import type { RawRange } from '../../view/coordinates'
import type { RowOperation } from '../row/RowOperation'

export type {
  DeleteRowsOperation,
  HideRowsOperation,
  InsertRowsOperation,
  MoveRowsOperation,
  RowOperation,
  UnhideRowsOperation,
} from '../row/RowOperation'

/** 可序列化、可传输、可回放的 engine 原子操作。 */
export type GridOperation =
  | SetCellValueOperation
  | RowOperation
  | InsertColumnsOperation
  | DeleteColumnsOperation
  | MoveColumnsOperation
  | HideColumnsOperation
  | UnhideColumnsOperation
  | SetColumnWidthOperation
  | SetRowHeightOperation
  | SetFillColorOperation
  | SetBordersOperation
  | SetTextWrapOperation
  | MergeCellsOperation
  | UnmergeCellsOperation

export interface SetCellValueOperation {
  readonly kind: 'setCellValue'
  readonly rowId: number
  readonly fieldId: string
  readonly value: CellValue
}

export interface InsertColumnsOperation {
  readonly kind: 'insertColumns'
  readonly at: number
  readonly fieldIds: readonly string[]
}

export interface DeleteColumnsOperation {
  readonly kind: 'deleteColumns'
  readonly fieldIds: readonly string[]
}

export interface MoveColumnsOperation {
  readonly kind: 'moveColumns'
  readonly fieldIds: readonly string[]
  readonly beforeFieldId: string | null
}

export interface HideColumnsOperation {
  readonly kind: 'hideColumns'
  readonly fieldIds: readonly string[]
}

export interface UnhideColumnsOperation {
  readonly kind: 'unhideColumns'
  readonly fieldIds: readonly string[]
}

export interface SetColumnWidthOperation {
  readonly kind: 'setColumnWidth'
  readonly fieldId: string
  readonly width: number
}

export interface SetRowHeightOperation {
  readonly kind: 'setRowHeight'
  readonly rowId: number
  readonly height: number
}

export interface SetFillColorOperation {
  readonly kind: 'setFillColor'
  readonly range: RawRange
  readonly color: string | null
}

export interface SetBordersOperation {
  readonly kind: 'setBorders'
  readonly range: RawRange
  readonly preset: BorderPreset
  readonly border: BorderStyle | null
}

export interface SetTextWrapOperation {
  readonly kind: 'setTextWrap'
  readonly range: RawRange
  readonly mode: TextWrapMode
}

export interface MergeCellsOperation {
  readonly kind: 'mergeCells'
  readonly range: RawRange
}

export interface UnmergeCellsOperation {
  readonly kind: 'unmergeCells'
  readonly range: RawRange
}
