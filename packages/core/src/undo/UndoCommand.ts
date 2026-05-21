import type { CellValue } from '../data/Schema'
import type { CellRange } from '../interaction/SelectionModel'

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
