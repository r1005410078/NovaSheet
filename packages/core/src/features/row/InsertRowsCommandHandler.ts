import type { GridEventPipeline } from '../../kernel/protocol/GridEventPipeline'
import type { RowsInserted } from '../../kernel/protocol/RowEvent'
import type { InsertRowsOperation } from '../../kernel/protocol/RowOperation'
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
