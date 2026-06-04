import type { GridEventPipeline } from '../event/GridEventPipeline'
import type { ColumnCommands } from './ColumnStructure'
import type { ColumnsMoved } from './ColumnEvent'
import type { MoveColsOperation } from './ColumnOperation'

/** 执行 moveCols operation，并把 column 领域产出的事件交给内部事件管线。 */
export class MoveColsCommandHandler {
  constructor(
    private readonly cols: ColumnCommands,
    private readonly events: Pick<GridEventPipeline, 'dispatch'>,
  ) {}

  execute(operation: MoveColsOperation): ColumnsMoved | null {
    const event = this.cols.moveCols(operation)
    if (!event) return null
    this.events.dispatch(event)
    return event
  }
}
