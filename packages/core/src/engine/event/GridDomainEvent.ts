import type { RowDomainEvent } from '../row/RowEvent'

export type {
  RowDomainEvent,
  RowsDeleted,
  RowsHidden,
  RowsInserted,
  RowsMoved,
  RowsUnhidden,
} from '../row/RowEvent'

/** 列领域事件。 */
export type ColumnDomainEvent =
  | ColumnsInserted
  | ColumnsDeleted
  | ColumnsMoved
  | ColumnsHidden
  | ColumnsUnhidden

/** Engine 内部同步分发的领域事件。 */
export type GridDomainEvent = RowDomainEvent | ColumnDomainEvent

export interface ColumnsInserted {
  readonly kind: 'columnsInserted'
  readonly at: number
  readonly count: number
  readonly fieldIds: readonly string[]
}

export interface ColumnsDeleted {
  readonly kind: 'columnsDeleted'
  readonly fieldIds: readonly string[]
  readonly indexMap: ReadonlyMap<number, number>
}

export interface ColumnsMoved {
  readonly kind: 'columnsMoved'
  readonly fieldIds: readonly string[]
  readonly beforeFieldId: string | null
  readonly indexMap: ReadonlyMap<number, number>
}

export interface ColumnsHidden {
  readonly kind: 'columnsHidden'
  readonly fieldIds: readonly string[]
}

export interface ColumnsUnhidden {
  readonly kind: 'columnsUnhidden'
  readonly fieldIds: readonly string[]
}
