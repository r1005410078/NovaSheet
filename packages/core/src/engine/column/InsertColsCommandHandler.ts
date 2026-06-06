import type { GridEventPipeline } from '../../kernel/protocol/GridEventPipeline'
import type { ColumnCommands } from './ColumnStructure'
import type { ColumnsInserted } from './ColumnEvent'
import type { InsertColsOperation } from './ColumnOperation'

/** 执行 insertCols operation，并把 column 领域产出的事件交给内部事件管线。 */
export class InsertColsCommandHandler {
  constructor(
    private readonly cols: ColumnCommands,
    private readonly events: Pick<GridEventPipeline, 'dispatch'>,
  ) {}

  execute(operation: InsertColsOperation): ColumnsInserted | null {
    const event = this.cols.insertCols(operation)
    if (!event) return null
    this.events.dispatch(event)
    return event
  }
}
