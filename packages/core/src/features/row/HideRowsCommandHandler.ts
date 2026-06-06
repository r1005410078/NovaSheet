import type { GridEventPipeline } from '../../kernel/protocol/GridEventPipeline'
import type { RowsHidden } from '../../kernel/protocol/RowEvent'
import type { HideRowsOperation } from '../../kernel/protocol/RowOperation'
import type { RowCommands } from './RowStructure'

/** 执行 hideRows operation，并把 row 领域产出的事件交给内部事件管线。 */
export class HideRowsCommandHandler {
  constructor(
    private readonly rows: RowCommands,
    private readonly events: Pick<GridEventPipeline, 'dispatch'>,
  ) {}

  execute(operation: HideRowsOperation): RowsHidden | null {
    const event = this.rows.hideRows(operation)
    if (!event) return null
    this.events.dispatch(event)
    return event
  }
}
