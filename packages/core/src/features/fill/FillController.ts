import type { MutableDataSource } from '../../kernel/data/MutableDataSource'
import { unionRange } from '../../kernel/geometry/range'
import type { CellWrite, UndoCommand } from '../../kernel/undo/UndoCommand'
import type { CellRange } from '../../kernel/coords/SelectionTypes'
import { computeFillWrites } from './FillSeries'
import type { FillStyleSnapshots } from './FillStylePropagator'
import type { FillDirection } from './FillTarget'

export interface FillCommitResult {
  readonly source: CellRange
  readonly fill: CellRange
  readonly result: CellRange
  readonly writes: readonly CellWrite[]
}

/** Fill commit 编排所需的 engine 能力。 */
export interface FillControllerContext {
  getMutableData(): MutableDataSource | null
  viewRowToRaw(viewRow: number): number
  pushUndo(command: UndoCommand): void
  propagateFillStyles(source: CellRange, fill: CellRange, direction: FillDirection): FillStyleSnapshots
  selectRange(range: CellRange): void
}

/** 填充柄 commit 写入门面（值写入 + 格式/合并平铺 + undo + 选区联动）。 */
export class FillController {
  constructor(private readonly ctx: FillControllerContext) {}

  commit(
    source: CellRange,
    fill: CellRange,
    direction: FillDirection,
  ): FillCommitResult | null {
    const data = this.ctx.getMutableData()
    if (!data) return null
    const viewWrites = computeFillWrites({ data, source, fill, direction })
    const resultWrites: CellWrite[] = viewWrites.map((w) => ({
      rowIndex: w.rowIndex,
      fieldId: w.fieldId,
      value: w.value,
    }))
    const after: CellWrite[] = viewWrites.map((w) => ({
      rowIndex: this.ctx.viewRowToRaw(w.rowIndex),
      fieldId: w.fieldId,
      value: w.value,
    }))
    if (after.length === 0) return null

    const before: CellWrite[] = viewWrites.map((w) => ({
      rowIndex: this.ctx.viewRowToRaw(w.rowIndex),
      fieldId: w.fieldId,
      value: data.getCell(w.rowIndex, w.fieldId) ?? null,
    }))
    for (const w of viewWrites) data.updateCell(w.rowIndex, w.fieldId, w.value)

    const styles = this.ctx.propagateFillStyles(source, fill, direction)

    const result = unionRange(source, fill)
    this.ctx.pushUndo({ kind: 'fill', source, fill, result, before, after, ...styles })
    this.ctx.selectRange(result)
    return { source, fill, result, writes: resultWrites }
  }
}
