import type { FieldType, Field } from '../data/Schema'
import type { CellAddress } from '../coords/SelectionTypes'

export interface CellEditSession {
  readonly cell: CellAddress
  readonly fieldId: string
  readonly fieldType: FieldType
  readonly draft: string
}

export interface CollapsedGap {
  readonly atViewRow: number
  readonly hiddenCount: number
  readonly hiddenIds: readonly number[]
}

export interface HeaderDecoration {
  readonly sortIndicator?: 'asc' | 'desc' | null
  readonly filterActive?: boolean
}

export interface HeaderDecorationSource {
  collectHeaderDecorations(field: Field): HeaderDecoration
}
