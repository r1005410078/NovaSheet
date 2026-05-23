import type { CellValue } from '../data/Schema'
import type { DeletedRowSnapshot } from '../data/MutableDataSource'
import type { CellRange, GridSelection } from '../interaction/SelectionModel'

export interface CellWrite {
  readonly rowIndex: number
  readonly fieldId: string
  readonly value: CellValue
}

export type UndoCommand =
  | {
      readonly kind: 'editCell'
      readonly rowIndex: number
      readonly fieldId: string
      readonly before: CellValue
      readonly after: CellValue
    }
  | {
      readonly kind: 'clearRange'
      readonly range: CellRange
      readonly before: ReadonlyArray<CellWrite>
    }
  | {
      readonly kind: 'paste'
      readonly target: CellRange
      readonly before: ReadonlyArray<CellWrite>
      readonly after: ReadonlyArray<CellWrite>
    }
  | {
      readonly kind: 'fill'
      readonly source: CellRange
      readonly fill: CellRange
      readonly result: CellRange
      readonly before: ReadonlyArray<CellWrite>
      readonly after: ReadonlyArray<CellWrite>
    }
  | {
      readonly kind: 'resizeRow'
      readonly rowIndex: number
      readonly before: number
      readonly after: number
    }
  | {
      readonly kind: 'resizeColumn'
      readonly colIndex: number
      readonly before: number
      readonly after: number
    }
  | {
      readonly kind: 'insertRows'
      readonly at: number
      readonly count: number
      readonly newIds: readonly number[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
  | {
      readonly kind: 'deleteRows'
      readonly snapshots: readonly DeletedRowSnapshot[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
  | {
      readonly kind: 'hideRows'
      readonly underlyingRowIds: readonly number[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
  | {
      readonly kind: 'unhideRows'
      readonly underlyingRowIds: readonly number[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
  | {
      readonly kind: 'resizeRowsMulti'
      readonly rowIds: readonly number[]
      readonly oldHeights: readonly number[]
      readonly newHeight: number
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
