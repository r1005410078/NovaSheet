import type { GridEventPipeline } from '../event/GridEventPipeline'
import type { RowsUnhidden } from './RowEvent'
import type { UnhideRowsOperation } from './RowOperation'
import type { RowStructure } from './RowStructure'

/** 执行 unhideRows operation，并把 row 领域产出的事件交给内部事件管线。 */
export class UnhideRowsCommandHandler {
  constructor(
    private readonly rows: RowStructure,
    private readonly events: Pick<GridEventPipeline, 'dispatch'>,
  ) {}

  execute(operation: UnhideRowsOperation): RowsUnhidden | null {
    const event = this.rows.unhideRows(operation)
    if (!event) return null
    this.events.dispatch(event)
    return event
  }
}
