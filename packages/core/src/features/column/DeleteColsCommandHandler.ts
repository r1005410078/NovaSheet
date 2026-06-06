import type { GridEventPipeline } from '../../kernel/protocol/GridEventPipeline'
import type { ColumnCommands } from './ColumnStructure'
import type { ColumnsDeleted } from '../../kernel/protocol/ColumnEvent'
import type { DeleteColsOperation } from '../../kernel/protocol/ColumnOperation'

/** 执行 deleteCols operation，并把 column 领域产出的事件交给内部事件管线。 */
export class DeleteColsCommandHandler {
  constructor(
    private readonly cols: ColumnCommands,
    private readonly events: Pick<GridEventPipeline, 'dispatch'>,
  ) {}

  execute(operation: DeleteColsOperation): ColumnsDeleted | null {
    const event = this.cols.deleteCols(operation)
    if (!event) return null
    this.events.dispatch(event)
    return event
  }
}
