import type { GridEventPipeline } from '../event/GridEventPipeline'
import type { RowCommands } from './RowStructure'
import type { RowsMoved } from './RowEvent'
import type { MoveRowsOperation } from './RowOperation'

/** 执行 moveRows operation，并把 row 领域产出的事件交给内部事件管线。 */
export class MoveRowsCommandHandler {
  constructor(
    private readonly rows: RowCommands,
    private readonly events: Pick<GridEventPipeline, 'dispatch'>,
  ) {}

  execute(operation: MoveRowsOperation): RowsMoved | null {
    const event = this.rows.moveRows(operation)
    if (!event) return null
    this.events.dispatch(event)
    return event
  }
}
