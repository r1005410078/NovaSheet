import type { GridDomainEvent } from '../../kernel/protocol/GridDomainEvent'
import type { GridDomainEventHandler } from '../../kernel/protocol/GridEventPipeline'
import type { ValidationRuleStore } from './ValidationRuleStore'
import type { ValidationResultStore } from './ValidationResultStore'

/** Validation stores 对结构领域事件的同步响应；raw 坐标跟随数据行/列移动。 */
export class ValidationEventHandler implements GridDomainEventHandler {
  constructor(
    private readonly ruleStore: ValidationRuleStore,
    private readonly resultStore: ValidationResultStore,
  ) {}

  handle(event: GridDomainEvent): void {
    switch (event.kind) {
      case 'rowsInserted':
        this.ruleStore.remapAfterRowsInserted(event.at, event.count)
        this.resultStore.remapAfterRowsInserted(event.at, event.count)
        return
      case 'rowsDeleted':
        this.ruleStore.remapAfterRowsDeleted([...event.rowIds].sort((a, b) => a - b))
        this.resultStore.remapAfterRowsDeleted([...event.rowIds].sort((a, b) => a - b))
        return
      case 'rowsMoved':
        this.ruleStore.remapByRowIndexMap(event.indexMap)
        this.resultStore.remapByRowIndexMap(event.indexMap)
        return
      case 'columnsInserted':
        this.ruleStore.remapAfterColsInserted(event.at, event.count)
        this.resultStore.remapAfterColsInserted(event.at, event.count)
        return
      case 'columnsDeleted':
        this.ruleStore.remapAfterColsDeleted([...event.removedIndices].sort((a, b) => a - b))
        this.resultStore.remapAfterColsDeleted([...event.removedIndices].sort((a, b) => a - b))
        return
      case 'columnsMoved':
        this.ruleStore.remapByColIndexMap(event.indexMap)
        this.resultStore.remapByColIndexMap(event.indexMap)
        return
      case 'rowsHidden':
      case 'rowsUnhidden':
      case 'columnsHidden':
      case 'columnsUnhidden':
        return
    }
  }
}
