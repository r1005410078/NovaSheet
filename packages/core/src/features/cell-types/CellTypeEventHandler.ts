import type { GridDomainEvent } from '../../kernel/protocol/GridDomainEvent'
import type { GridDomainEventHandler } from '../../kernel/protocol/GridEventPipeline'
import type { CellTypeStore } from './CellTypeStore'

/** Cell type override store 对结构领域事件的同步响应；override 按 raw 坐标跟随数据行/列。 */
export class CellTypeEventHandler implements GridDomainEventHandler {
  constructor(private readonly store: CellTypeStore) {}

  handle(event: GridDomainEvent): void {
    switch (event.kind) {
      case 'rowsInserted':
        this.store.remapAfterRowsInserted(event.at, event.count)
        return
      case 'rowsDeleted':
        this.store.remapAfterRowsDeleted([...event.rowIds].sort((a, b) => a - b))
        return
      case 'rowsMoved':
        this.store.remapByRowIndexMap(event.indexMap)
        return
      case 'columnsInserted':
        this.store.remapAfterColsInserted(event.at, event.count)
        return
      case 'columnsDeleted':
        this.store.remapAfterColsDeleted([...event.removedIndices].sort((a, b) => a - b))
        return
      case 'columnsMoved':
        this.store.remapByColIndexMap(event.indexMap)
        return
      case 'rowsHidden':
      case 'rowsUnhidden':
      case 'columnsHidden':
      case 'columnsUnhidden':
        return
    }
  }
}
