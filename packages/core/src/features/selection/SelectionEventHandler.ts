import type { GridDomainEvent } from '../../kernel/protocol/GridDomainEvent'
import type { GridDomainEventHandler } from '../../kernel/protocol/GridEventPipeline'
import type { SelectionCommands } from './SelectionState'

export interface SelectionEventHandlerContext {
  getVisibleFieldIds(): readonly string[]
}

/** Selection 领域响应结构事件；不 dispatch 新事件。 */
export class SelectionEventHandler implements GridDomainEventHandler {
  constructor(
    private readonly selection: SelectionCommands,
    private readonly context: SelectionEventHandlerContext,
  ) {}

  handle(event: GridDomainEvent): void {
    switch (event.kind) {
      case 'rowsInserted':
        this.selection.remapAfterRowsInserted(event.at, event.count)
        return
      case 'rowsDeleted':
        this.selection.remapAfterRowsDeleted(event.rowIds)
        return
      case 'rowsMoved':
        this.selection.restoreByRowIndexMap(event.indexMap)
        return
      case 'columnsInserted':
        this.selection.remapAfterColsInserted(event.at, event.count)
        return
      case 'columnsDeleted':
        this.selection.remapAfterColsDeleted(event.removedIndices)
        return
      case 'columnsMoved':
        this.selection.restoreByCapturedVisibleFieldIds(this.context.getVisibleFieldIds())
        return
      case 'rowsHidden':
      case 'rowsUnhidden':
      case 'columnsHidden':
      case 'columnsUnhidden':
        return
    }
  }
}
