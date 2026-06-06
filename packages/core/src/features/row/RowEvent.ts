import type { DeletedRowSnapshot } from '../../kernel/data/MutableDataSource'

/** 行领域事件：描述 row 领域已经完成的事实。 */
export type RowDomainEvent =
  | RowsInserted
  | RowsDeleted
  | RowsMoved
  | RowsHidden
  | RowsUnhidden

export interface RowsInserted {
  readonly kind: 'rowsInserted'
  readonly at: number
  readonly count: number
  readonly newRowIds: readonly number[]
}

export interface RowsDeleted {
  readonly kind: 'rowsDeleted'
  readonly rowIds: readonly number[]
  readonly snapshots: readonly DeletedRowSnapshot[]
  readonly deletedHeights: readonly number[]
}

export interface RowsMoved {
  readonly kind: 'rowsMoved'
  readonly rowIds: readonly number[]
  readonly beforeRowId: number | null
  readonly inverseRowIds: readonly number[]
  readonly inverseBeforeRowId: number | null
  readonly indexMap: ReadonlyMap<number, number>
}

export interface RowsHidden {
  readonly kind: 'rowsHidden'
  readonly rowIds: readonly number[]
}

export interface RowsUnhidden {
  readonly kind: 'rowsUnhidden'
  readonly rowIds: readonly number[]
}
