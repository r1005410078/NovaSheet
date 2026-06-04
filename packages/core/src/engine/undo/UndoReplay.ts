import type { CellValue } from '../../data/Schema'
import type { FormatLayer } from '../../format/CellFormat'
import type { MergeRegion } from '../../merge/MergeStore'
import type { GridSelection } from '../../interaction/SelectionModel'

/** Undo replay 可调用的受控写入面；不得镜像整个 `DefaultGridEngine`。 */
export interface UndoReplayContext {
  applyCellWrite(rowIndex: number, fieldId: string, value: CellValue): void
  restoreSelection(selection: GridSelection): void
  restoreFormat(layers: readonly FormatLayer[]): void
  restoreMerge(regions: readonly MergeRegion[]): void
  rebuildRows(): void
  rebuildCols(): void
}

