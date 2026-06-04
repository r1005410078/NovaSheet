import type { GridEventPipeline } from '../event/GridEventPipeline'
import type { RowsHidden } from './RowEvent'
import type { HideRowsOperation } from './RowOperation'
import type { RowStructure } from './RowStructure'

/** 执行 hideRows operation，并把 row 领域产出的事件交给内部事件管线。 */
export class HideRowsCommandHandler {
  constructor(
    private readonly rows: RowStructure,
    private readonly events: Pick<GridEventPipeline, 'dispatch'>,
  ) {}

  execute(operation: HideRowsOperation): RowsHidden | null {
    const event = this.rows.hideRows(operation)
    if (!event) return null
    this.events.dispatch(event)
    return event
  }
}
