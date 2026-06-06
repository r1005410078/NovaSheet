import type { GridEventPipeline } from '../../kernel/protocol/GridEventPipeline'
import type { ColumnCommands } from './ColumnStructure'
import type { ColumnsHidden } from '../../kernel/protocol/ColumnEvent'
import type { HideColsOperation } from '../../kernel/protocol/ColumnOperation'

/** 执行 hideCols operation，并把 column 领域产出的事件交给内部事件管线。 */
export class HideColsCommandHandler {
  constructor(
    private readonly cols: ColumnCommands,
    private readonly events: Pick<GridEventPipeline, 'dispatch'>,
  ) {}

  execute(operation: HideColsOperation): ColumnsHidden | null {
    const event = this.cols.hideCols(operation)
    if (!event) return null
    this.events.dispatch(event)
    return event
  }
}
