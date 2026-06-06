import type { RowDomainEvent } from '../../features/row/RowEvent'
import type { ColumnDomainEvent } from '../../features/column/ColumnEvent'

export type {
  RowDomainEvent,
  RowsDeleted,
  RowsHidden,
  RowsInserted,
  RowsMoved,
  RowsUnhidden,
} from '../../features/row/RowEvent'

export type {
  ColumnDomainEvent,
  ColumnsDeleted,
  ColumnsHidden,
  ColumnsInserted,
  ColumnsMoved,
  ColumnsUnhidden,
} from '../../features/column/ColumnEvent'

/** Engine 内部同步分发的领域事件。 */
export type GridDomainEvent = RowDomainEvent | ColumnDomainEvent
