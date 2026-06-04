import type { GridEventPipeline } from '../event/GridEventPipeline'
import type { RowsInserted } from './RowEvent'
import type { InsertRowsOperation } from './RowOperation'
import type { RowCommands } from './RowStructure'

/** 执行 insertRows operation，并把 row 领域产出的事件交给内部事件管线。 */
export class InsertRowsCommandHandler {
  constructor(
    private readonly rows: RowCommands,
    private readonly events: Pick<GridEventPipeline, 'dispatch'>,
  ) {}

  execute(operation: InsertRowsOperation): RowsInserted | null {
    const event = this.rows.insertRows(operation)
    if (!event) return null
    this.events.dispatch(event)
    return event
  }
}
