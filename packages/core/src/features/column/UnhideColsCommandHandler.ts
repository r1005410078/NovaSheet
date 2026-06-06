import type { GridEventPipeline } from '../../kernel/protocol/GridEventPipeline'
import type { ColumnCommands } from './ColumnStructure'
import type { ColumnsUnhidden } from '../../kernel/protocol/ColumnEvent'
import type { UnhideColsOperation } from '../../kernel/protocol/ColumnOperation'

/** 执行 unhideCols operation，并把 column 领域产出的事件交给内部事件管线。 */
export class UnhideColsCommandHandler {
  constructor(
    private readonly cols: ColumnCommands,
    private readonly events: Pick<GridEventPipeline, 'dispatch'>,
  ) {}

  execute(operation: UnhideColsOperation): ColumnsUnhidden | null {
    const event = this.cols.unhideCols(operation)
    if (!event) return null
    this.events.dispatch(event)
    return event
  }
}
