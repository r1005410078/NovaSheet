export type CellTypeOverride = 'text' | 'number' | 'date' | 'checkbox'

export interface CellTypeEntry {
  readonly rowIndex: number
  readonly colIndex: number
  readonly type: CellTypeOverride
}

export type CellTypeSnapshot = readonly CellTypeEntry[]
