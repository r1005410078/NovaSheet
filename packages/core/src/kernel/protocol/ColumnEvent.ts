import type { RemovedFieldSnapshot } from '../data/MutableDataSource'
import type { Field } from '../data/Schema'

/** 列领域事件：描述 column 领域已经完成的事实。 */
export type ColumnDomainEvent =
  | ColumnsInserted
  | ColumnsDeleted
  | ColumnsHidden
  | ColumnsUnhidden
  | ColumnsMoved

export interface ColumnsInserted {
  readonly kind: 'columnsInserted'
  readonly at: number
  readonly count: number
  readonly newFields: readonly Field[]
}

export interface ColumnsDeleted {
  readonly kind: 'columnsDeleted'
  readonly removedIndices: readonly number[]
  readonly snapshots: readonly RemovedFieldSnapshot[]
  readonly deletedWidths: readonly number[]
}

export interface ColumnsHidden {
  readonly kind: 'columnsHidden'
  readonly fieldIds: readonly string[]
}

export interface ColumnsUnhidden {
  readonly kind: 'columnsUnhidden'
  readonly fieldIds: readonly string[]
}

export interface ColumnsMoved {
  readonly kind: 'columnsMoved'
  readonly fieldIds: readonly string[]
  readonly beforeFieldId: string | null
  readonly inverseBeforeFieldId: string | null
  readonly indexMap: ReadonlyMap<number, number>
}
