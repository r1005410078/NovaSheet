import type { CellValue, Field } from '../data/Schema'
import type { DeletedRowSnapshot, RemovedFieldSnapshot } from '../data/MutableDataSource'
import type { FormatLayer } from '../format/CellFormat'
import type { CellRange, GridSelection } from '../interaction/SelectionModel'
import type { FrozenConfig } from '../layout/FrozenRegions'

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
      /** 删除前各行（按 snapshots 顺序）在 rowsAxis 中的高度；供 undo 还原行高。 */
      readonly deletedHeights: readonly number[]
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
  | {
      readonly kind: 'moveRows'
      readonly rowIds: readonly number[]
      readonly beforeRowId: number | null
      readonly inverseRowIds: readonly number[]
      readonly inverseBeforeRowId: number | null
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
  | {
      readonly kind: 'insertCols'
      readonly at: number
      readonly count: number
      readonly newFields: readonly Field[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
      readonly frozenBefore: FrozenConfig
      readonly frozenAfter: FrozenConfig
    }
  | {
      readonly kind: 'deleteCols'
      readonly snapshots: readonly RemovedFieldSnapshot[]
      readonly deletedWidths: readonly number[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
      readonly frozenBefore: FrozenConfig
      readonly frozenAfter: FrozenConfig
    }
  | {
      readonly kind: 'hideCols'
      readonly fieldIds: readonly string[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
  | {
      readonly kind: 'unhideCols'
      readonly fieldIds: readonly string[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
  | {
      readonly kind: 'resizeColumnsMulti'
      readonly fieldIds: readonly string[]
      readonly oldWidths: readonly number[]
      readonly newWidth: number
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
  | {
      readonly kind: 'moveCols'
      readonly fieldIds: readonly string[]
      readonly beforeFieldId: string | null
      readonly inverseBeforeFieldId: string | null
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
  | {
      readonly kind: 'format'
      readonly before: readonly FormatLayer[]
      readonly after: readonly FormatLayer[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
