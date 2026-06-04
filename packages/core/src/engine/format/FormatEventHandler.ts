import type { GridDomainEvent } from '../event/GridDomainEvent'
import type { GridDomainEventHandler } from '../event/GridEventPipeline'

/** Format 领域响应结构事件所需的最小写入面。 */
export interface FormatEventHandlerContext {
  remapFormatRows(indexMap: ReadonlyMap<number, number>): void
  remapMergeRows(indexMap: ReadonlyMap<number, number>): void
  remapFormatAfterRowsInserted(at: number, count: number): void
  remapMergeAfterRowsInserted(at: number, count: number): void
  remapFormatAfterRowsDeleted(rowIds: readonly number[]): void
  remapMergeAfterRowsDeleted(rowIds: readonly number[]): void
}

/** Format / merge store 对 engine domain event 的同步响应。 */
export class FormatEventHandler implements GridDomainEventHandler {
  constructor(private readonly context: FormatEventHandlerContext) {}

  handle(event: GridDomainEvent): void {
    switch (event.kind) {
      case 'rowsInserted':
        this.context.remapFormatAfterRowsInserted(event.at, event.count)
        this.context.remapMergeAfterRowsInserted(event.at, event.count)
        return
      case 'rowsDeleted':
        this.context.remapFormatAfterRowsDeleted(event.rowIds)
        this.context.remapMergeAfterRowsDeleted(event.rowIds)
        return
      case 'rowsMoved':
        // 作用：保持行移动后格式和合并区域继续跟随对应的数据行。
        // 例：row 1 有红色填充，被移动到 row 5 后，红色填充也应移动到 row 5。
        this.context.remapFormatRows(event.indexMap)
        this.context.remapMergeRows(event.indexMap)
        return
      case 'rowsHidden':
      case 'rowsUnhidden':
      case 'columnsInserted':
      case 'columnsDeleted':
      case 'columnsMoved':
      case 'columnsHidden':
      case 'columnsUnhidden':
        return
    }
  }
}
