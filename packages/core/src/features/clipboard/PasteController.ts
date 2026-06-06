import type { Schema } from '../../kernel/data/Schema'
import type { MutableDataSource } from '../../kernel/data/MutableDataSource'
import type { CellWrite, UndoCommand } from '../../kernel/undo/UndoCommand'
import type { CellRange } from '../selection/SelectionTypes'
import type { RawRange } from '../../kernel/coords/coordinates'
import type { MergeRegion } from '../merge/MergeStore'
import {
  applyPaste,
  pasteTargetConflictsWithMerges,
  type ApplyPasteSource,
  type PasteTargetRect,
  type PasteWriteRecord,
} from './ApplyPaste'
import type { PasteSkippedCell } from './types'

/** Paste commit 编排所需的 engine 能力。 */
export interface PasteControllerContext {
  getMutableData(): MutableDataSource | null
  viewRangeToRaw(range: CellRange): RawRange | null
  getMergeSnapshot(): readonly MergeRegion[]
  getSchema(): Schema
  viewRowToRaw(viewRow: number): number
  pushUndo(command: UndoCommand): void
}

/** 内部粘贴 commit 写入门面（merge 守卫 + undo 入栈）。 */
export class PasteController {
  constructor(private readonly ctx: PasteControllerContext) {}

  commit(
    source: ApplyPasteSource,
    target: PasteTargetRect,
    fieldIdsAtCols: readonly string[],
    onSkipped?: (cells: readonly PasteSkippedCell[]) => void,
  ): void {
    const data = this.ctx.getMutableData()
    if (!data) return

    const rawTarget = this.ctx.viewRangeToRaw({
      startRow: target.startRow,
      endRow: target.endRow,
      startCol: target.startCol,
      endCol: target.endCol,
    })
    const conflictsWithMerges =
      rawTarget === null ||
      pasteTargetConflictsWithMerges(
        { ...rawTarget, tile: target.tile },
        this.ctx.getMergeSnapshot(),
      )
    if (conflictsWithMerges) {
      const topLeftFieldId = fieldIdsAtCols[target.startCol]
      if (topLeftFieldId !== undefined) {
        onSkipped?.([{ rowIndex: target.startRow, fieldId: topLeftFieldId, reason: 'merge' }])
      }
      return
    }

    const before: CellWrite[] = []
    const after: CellWrite[] = []
    applyPaste(
      source,
      target,
      this.ctx.getSchema(),
      fieldIdsAtCols,
      data,
      onSkipped,
      (rec: PasteWriteRecord) => {
        const underlyingRow = this.ctx.viewRowToRaw(rec.rowIndex)
        before.push({ rowIndex: underlyingRow, fieldId: rec.fieldId, value: rec.before })
        after.push({ rowIndex: underlyingRow, fieldId: rec.fieldId, value: rec.after })
      },
    )
    if (after.length === 0) return
    const range: CellRange = {
      startRow: target.startRow,
      endRow: target.endRow,
      startCol: target.startCol,
      endCol: target.endCol,
    }
    this.ctx.pushUndo({ kind: 'paste', target: range, before, after })
  }
}
