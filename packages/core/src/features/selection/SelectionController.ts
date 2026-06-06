import type {
  CellAddress,
  CellRange,
  GridSelection,
  SelectCellOptions,
} from '../../kernel/coords/SelectionTypes'
import type {
  GridIndexBounds,
  SelectionMergeLookup,
  SelectionNavigationIntent,
} from './SelectionNavigation'
import type { SelectionState } from './SelectionState'

const NO_MERGE: SelectionMergeLookup = { resolveMergeRegion: () => null }

/** sort/filter 等 view-row 映射变化后恢复选区所需的显式映射能力。 */
export interface ViewRowRemapContext {
  oldViewRowToRaw(viewRow: number): number
  rawRowToView(rawRow: number): number
}

/**
 * Selection 写入门面 + 跨聚合协调器（**非** CQRS command handler，selection 不产领域事件）。
 *
 * 两个职责：
 * 1. **写入门面**：engine/facade 的选区写入统一经此，不直连聚合 mutation（invariant #3）；
 *    读路径仍可经 `SelectionState.getSelection`。
 * 2. **Domain Service**：托管 Selection × Merge 的跨聚合协调（`selectCell` 吸附、`navigate`
 *    注入 merge lookup）——该逻辑既不能进平台无关、merge-无感的聚合根，也不该散回 engine。
 *
 * 与 row/column 的 `*CommandHandler` 区别见 selection/README「为什么没有 execute」。
 */
export class SelectionController {
  constructor(
    private readonly selection: SelectionState,
    private readonly merge: SelectionMergeLookup = NO_MERGE,
  ) {}

  /** 选择单元格；非 extend 落在合并区时吸附为整块（对齐点击合并格语义）。 */
  selectCell(cell: CellAddress, options?: SelectCellOptions): void {
    if (!options?.extend) {
      const region = this.merge.resolveMergeRegion(cell.rowIndex, cell.colIndex)
      if (region) {
        this.selection.setSelectedRange(region)
        return
      }
    }
    this.selection.selectCell(cell, options)
  }

  setSelectedRange(range: CellRange): void {
    this.selection.setSelectedRange(range)
  }

  setSelection(selection: GridSelection): void {
    this.selection.setSelection(selection)
  }

  clear(): void {
    this.selection.clear()
  }

  /** 键盘导航；合并区感知由注入的 merge lookup 提供。 */
  navigate(intent: SelectionNavigationIntent, bounds: GridIndexBounds): CellAddress | null {
    return this.selection.navigate(intent, bounds, this.merge)
  }

  captureVisibleFieldIdsBefore(fieldIds: readonly string[]): void {
    this.selection.captureVisibleFieldIdsBefore(fieldIds)
  }

  remapAfterViewRowsChanged(context: ViewRowRemapContext): void {
    this.selection.remapAfterViewRowsChanged(context)
  }
}
