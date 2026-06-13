import type { GridDomainEvent } from '../../kernel/protocol/GridDomainEvent'
import type { GridDomainEventHandler } from '../../kernel/protocol/GridEventPipeline'
import type { FormatState } from './FormatState'

/** @deprecated 使用 `FormatState` remap 面；保留类型别名供文档/测试引用。 */
export type FormatEventHandlerContext = Pick<
  FormatState,
  | 'remapFormatRows'
  | 'remapMergeRows'
  | 'remapAttachmentRows'
  | 'remapFormatAfterRowsInserted'
  | 'remapMergeAfterRowsInserted'
  | 'remapAttachmentAfterRowsInserted'
  | 'remapFormatAfterRowsDeleted'
  | 'remapMergeAfterRowsDeleted'
  | 'remapAttachmentAfterRowsDeleted'
  | 'remapFormatCols'
  | 'remapMergeCols'
  | 'remapAttachmentCols'
  | 'remapFormatAfterColsInserted'
  | 'remapMergeAfterColsInserted'
  | 'remapAttachmentAfterColsInserted'
  | 'remapFormatAfterColsDeleted'
  | 'remapMergeAfterColsDeleted'
  | 'remapAttachmentAfterColsDeleted'
>

/** Format / merge store 对 engine domain event 的同步响应。 */
export class FormatEventHandler implements GridDomainEventHandler {
  constructor(private readonly state: FormatState) {}

  handle(event: GridDomainEvent): void {
    switch (event.kind) {
      case 'rowsInserted':
        this.state.remapFormatAfterRowsInserted(event.at, event.count)
        this.state.remapMergeAfterRowsInserted(event.at, event.count)
        this.state.remapAttachmentAfterRowsInserted(event.at, event.count)
        return
      case 'rowsDeleted':
        this.state.remapFormatAfterRowsDeleted(event.rowIds)
        this.state.remapMergeAfterRowsDeleted(event.rowIds)
        this.state.remapAttachmentAfterRowsDeleted(event.rowIds)
        return
      case 'rowsMoved':
        // 作用：保持行移动后格式和合并区域继续跟随对应的数据行。
        // 例：row 1 有红色填充，被移动到 row 5 后，红色填充也应移动到 row 5。
        this.state.remapFormatRows(event.indexMap)
        this.state.remapMergeRows(event.indexMap)
        this.state.remapAttachmentRows(event.indexMap)
        return
      case 'columnsInserted':
        this.state.remapFormatAfterColsInserted(event.at, event.count)
        this.state.remapMergeAfterColsInserted(event.at, event.count)
        this.state.remapAttachmentAfterColsInserted(event.at, event.count)
        return
      case 'columnsDeleted':
        this.state.remapFormatAfterColsDeleted(event.removedIndices)
        this.state.remapMergeAfterColsDeleted(event.removedIndices)
        this.state.remapAttachmentAfterColsDeleted(event.removedIndices)
        return
      case 'columnsMoved':
        // 作用：列移动后让格式和合并区域继续跟随对应的数据列（按 raw 列索引重映射）。
        this.state.remapFormatCols(event.indexMap)
        this.state.remapMergeCols(event.indexMap)
        this.state.remapAttachmentCols(event.indexMap)
        return
      case 'rowsHidden':
      case 'rowsUnhidden':
      case 'columnsHidden':
      case 'columnsUnhidden':
        // 隐藏/取消隐藏不改变 raw 坐标，format/merge 按 raw 键控，无需重映射。
        return
    }
  }
}
