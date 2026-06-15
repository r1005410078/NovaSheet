import type { FieldType } from '../data/Schema'

export type ScalarCellType = 'text' | 'number' | 'date' | 'checkbox'
export type CellTypeOverride = FieldType

export interface CellTypeEntry {
  readonly rowIndex: number
  readonly colIndex: number
  readonly type: CellTypeOverride
}

export type CellTypeSnapshot = readonly CellTypeEntry[]
