import type { GridEventPipeline } from '../../kernel/protocol/GridEventPipeline'
import type { RowsDeleted } from '../../kernel/protocol/RowEvent'
import type { DeleteRowsOperation } from '../../kernel/protocol/RowOperation'
import type { RowCommands } from './RowStructure'

/** 执行 deleteRows operation，并把 row 领域产出的事件交给内部事件管线。 */
export class DeleteRowsCommandHandler {
  constructor(
    private readonly rows: RowCommands,
    private readonly events: Pick<GridEventPipeline, 'dispatch'>,
  ) {}

  execute(operation: DeleteRowsOperation): RowsDeleted | null {
    const event = this.rows.deleteRows(operation)
    if (!event) return null
    this.events.dispatch(event)
    return event
  }
}
