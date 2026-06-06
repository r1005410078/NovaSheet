import type { ColumnDomainEvent } from './ColumnEvent'
import type { RowDomainEvent } from './RowEvent'

export type {
  RowDomainEvent,
  RowsDeleted,
  RowsHidden,
  RowsInserted,
  RowsMoved,
  RowsUnhidden,
} from './RowEvent'

export type {
  ColumnDomainEvent,
  ColumnsDeleted,
  ColumnsHidden,
  ColumnsInserted,
  ColumnsMoved,
  ColumnsUnhidden,
} from './ColumnEvent'

/** Engine 内部同步分发的领域事件。 */
export type GridDomainEvent = RowDomainEvent | ColumnDomainEvent
