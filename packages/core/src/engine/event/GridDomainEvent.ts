import type { RowDomainEvent } from '../row/RowEvent'
import type { ColumnDomainEvent } from '../column/ColumnEvent'

export type {
  RowDomainEvent,
  RowsDeleted,
  RowsHidden,
  RowsInserted,
  RowsMoved,
  RowsUnhidden,
} from '../row/RowEvent'

export type {
  ColumnDomainEvent,
  ColumnsDeleted,
  ColumnsHidden,
  ColumnsInserted,
  ColumnsMoved,
  ColumnsUnhidden,
} from '../column/ColumnEvent'

/** Engine 内部同步分发的领域事件。 */
export type GridDomainEvent = RowDomainEvent | ColumnDomainEvent
