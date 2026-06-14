import type { CellRange, GridSelection } from '../../kernel/coords/SelectionTypes'
import type { RawRange } from '../../kernel/coords/coordinates'
import type { UndoCommand } from '../../kernel/undo/UndoCommand'
import type { CellTypeOverride, CellTypeSnapshot } from './CellTypeStore'
import type { CellTypeStore } from './CellTypeStore'

export interface CellTypeControllerContext {
  /** view range → raw range；排序/筛选打乱映射时返回 null。 */
  translateRange(range: CellRange): RawRange | null
  /** 入栈一条 cellType undo 命令。 */
  pushUndo(command: UndoCommand): void
  /** 当前选区快照，用于 before/after 记录。 */
  getSelection(): GridSelection
}

/** Cell type override 写入门面：负责 view→raw、快照比较与 undo 编排。 */
export class CellTypeController {
  constructor(
    private readonly store: CellTypeStore,
    private readonly ctx: CellTypeControllerContext,
  ) {}

  setCellType(range: CellRange, type: CellTypeOverride): boolean {
    const rawRange = this.ctx.translateRange(range)
    if (!rawRange) return false
    const selectionBefore = this.ctx.getSelection()
    const before = this.store.snapshot()
    this.store.set(rawRange, type)
    return this.commit(before, selectionBefore)
  }

  clearCellType(range: CellRange): boolean {
    const rawRange = this.ctx.translateRange(range)
    if (!rawRange) return false
    const selectionBefore = this.ctx.getSelection()
    const before = this.store.snapshot()
    this.store.clear(rawRange)
    return this.commit(before, selectionBefore)
  }

  private commit(before: CellTypeSnapshot, selectionBefore: GridSelection): boolean {
    const after = this.store.snapshot()
    if (sameCellTypeSnapshots(before, after)) return false
    this.ctx.pushUndo({
      kind: 'cellType',
      before,
      after,
      selectionBefore,
      selectionAfter: this.ctx.getSelection(),
    })
    return true
  }
}

function sameCellTypeSnapshots(left: CellTypeSnapshot, right: CellTypeSnapshot): boolean {
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i]!
    const b = right[i]!
    if (a.rowIndex !== b.rowIndex || a.colIndex !== b.colIndex || a.type !== b.type) return false
  }
  return true
}
