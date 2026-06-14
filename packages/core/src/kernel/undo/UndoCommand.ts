import type { CellValue, Field } from '../data/Schema'
import type { DeletedRowSnapshot, RemovedFieldSnapshot } from '../data/MutableDataSource'
import type { MergeRegion } from '../coords/MergeRegion'
import type { CellRange, GridSelection } from '../coords/SelectionTypes'
import type { FrozenConfig } from '../geometry/FrozenRegions'
import type { FormatLayer } from '../protocol/FormatTypes'
import type { CellAttachmentSnapshot } from '../protocol/AttachmentTypes'

export interface CellWrite {
  readonly rowIndex: number
  readonly fieldId: string
  readonly value: CellValue
}

export type UndoCommand =
  | {
      readonly kind: 'editCell'
      readonly rowIndex: number
      readonly fieldId: string
      readonly before: CellValue
      readonly after: CellValue
    }
  | {
      readonly kind: 'clearRange'
      readonly range: CellRange
      readonly before: ReadonlyArray<CellWrite>
      // F9：clearRange 同时清 attachment，快照 bundle 进同一命令（Task 4）。
      readonly attachmentBefore?: CellAttachmentSnapshot
      readonly attachmentAfter?: CellAttachmentSnapshot
    }
  | {
      readonly kind: 'paste'
      readonly target: CellRange
      readonly before: ReadonlyArray<CellWrite>
      readonly after: ReadonlyArray<CellWrite>
      // Phase C-edit-data paste 携带附件快照（Task 5 填充；typed-cache 命中时存在）。
      readonly attachmentBefore?: CellAttachmentSnapshot
      readonly attachmentAfter?: CellAttachmentSnapshot
    }
  | {
      readonly kind: 'fill'
      readonly source: CellRange
      readonly fill: CellRange
      readonly result: CellRange
      readonly before: ReadonlyArray<CellWrite>
      readonly after: ReadonlyArray<CellWrite>
      // Phase 5-A fill 携带格式/合并：仅当 raw 映射连续（propagation 执行）时填充，
      // 非连续散裂时缺省（undo/redo 不恢复 store）。
      readonly formatBefore?: readonly FormatLayer[]
      readonly formatAfter?: readonly FormatLayer[]
      readonly mergeBefore?: readonly MergeRegion[]
      readonly mergeAfter?: readonly MergeRegion[]
      // Phase C-edit-data fill 携带附件快照（同 format/merge，非连续时缺省）。
      readonly attachmentBefore?: CellAttachmentSnapshot
      readonly attachmentAfter?: CellAttachmentSnapshot
    }
  | {
      readonly kind: 'resizeRow'
      readonly rowIndex: number
      readonly before: number
      readonly after: number
    }
  | {
      readonly kind: 'resizeColumn'
      readonly colIndex: number
      readonly before: number
      readonly after: number
    }
  | {
      readonly kind: 'insertRows'
      readonly at: number
      readonly count: number
      readonly newIds: readonly number[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
      readonly formatBefore: readonly FormatLayer[]
      readonly formatAfter: readonly FormatLayer[]
      readonly mergeBefore: readonly MergeRegion[]
      readonly mergeAfter: readonly MergeRegion[]
    }
  | {
      readonly kind: 'deleteRows'
      readonly snapshots: readonly DeletedRowSnapshot[]
      /** 删除前各行（按 snapshots 顺序）在 rowsAxis 中的高度；供 undo 还原行高。 */
      readonly deletedHeights: readonly number[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
      readonly formatBefore: readonly FormatLayer[]
      readonly formatAfter: readonly FormatLayer[]
      readonly mergeBefore: readonly MergeRegion[]
      readonly mergeAfter: readonly MergeRegion[]
    }
  | {
      readonly kind: 'hideRows'
      readonly underlyingRowIds: readonly number[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
  | {
      readonly kind: 'unhideRows'
      readonly underlyingRowIds: readonly number[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
  | {
      readonly kind: 'resizeRowsMulti'
      readonly rowIds: readonly number[]
      readonly oldHeights: readonly number[]
      readonly newHeight: number
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
  | {
      readonly kind: 'moveRows'
      readonly rowIds: readonly number[]
      readonly beforeRowId: number | null
      readonly inverseRowIds: readonly number[]
      readonly inverseBeforeRowId: number | null
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
      readonly formatBefore: readonly FormatLayer[]
      readonly formatAfter: readonly FormatLayer[]
      readonly mergeBefore: readonly MergeRegion[]
      readonly mergeAfter: readonly MergeRegion[]
    }
  | {
      readonly kind: 'insertCols'
      readonly at: number
      readonly count: number
      readonly newFields: readonly Field[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
      readonly frozenBefore: FrozenConfig
      readonly frozenAfter: FrozenConfig
      readonly formatBefore: readonly FormatLayer[]
      readonly formatAfter: readonly FormatLayer[]
      readonly mergeBefore: readonly MergeRegion[]
      readonly mergeAfter: readonly MergeRegion[]
    }
  | {
      readonly kind: 'deleteCols'
      readonly snapshots: readonly RemovedFieldSnapshot[]
      readonly deletedWidths: readonly number[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
      readonly frozenBefore: FrozenConfig
      readonly frozenAfter: FrozenConfig
      readonly formatBefore: readonly FormatLayer[]
      readonly formatAfter: readonly FormatLayer[]
      readonly mergeBefore: readonly MergeRegion[]
      readonly mergeAfter: readonly MergeRegion[]
    }
  | {
      readonly kind: 'hideCols'
      readonly fieldIds: readonly string[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
  | {
      readonly kind: 'unhideCols'
      readonly fieldIds: readonly string[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
  | {
      readonly kind: 'resizeColumnsMulti'
      readonly fieldIds: readonly string[]
      readonly oldWidths: readonly number[]
      readonly newWidth: number
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
  | {
      readonly kind: 'moveCols'
      readonly fieldIds: readonly string[]
      readonly beforeFieldId: string | null
      readonly inverseBeforeFieldId: string | null
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
      readonly formatBefore: readonly FormatLayer[]
      readonly formatAfter: readonly FormatLayer[]
      readonly mergeBefore: readonly MergeRegion[]
      readonly mergeAfter: readonly MergeRegion[]
    }
  | {
      readonly kind: 'format'
      readonly before: readonly FormatLayer[]
      readonly after: readonly FormatLayer[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
      /** 附件快照（可选，仅 setCellAttachment 场景填充）。 */
      readonly attachmentBefore?: CellAttachmentSnapshot
      readonly attachmentAfter?: CellAttachmentSnapshot
    }
  | {
      readonly kind: 'merge'
      readonly before: readonly MergeRegion[]
      readonly after: readonly MergeRegion[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
  | {
      readonly kind: 'unmerge'
      readonly before: readonly MergeRegion[]
      readonly after: readonly MergeRegion[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
