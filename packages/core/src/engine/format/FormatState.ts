import type { FormatLayer } from '../../format/CellFormat'
import type { RangeStyleStore } from '../../format/RangeStyleStore'
import type { CellRange, GridSelection } from '../../features/selection/SelectionTypes'
import type { MergeRegion, MergeStore } from '../../merge/MergeStore'
import type { RawRange } from '../../kernel/coords/coordinates'

/** 格式/合并领域读取/写入 store 与坐标翻译的最小上下文。 */
export interface FormatStateContext {
  readonly formatStore: RangeStyleStore
  readonly mergeStore: MergeStore
  viewRangeToRawRange(range: CellRange): RawRange | null
  commitFormatChange(before: readonly FormatLayer[], selectionBefore: GridSelection): boolean
  pushMergeUndo(
    kind: 'merge' | 'unmerge',
    before: readonly MergeRegion[],
    after: readonly MergeRegion[],
    selectionBefore: GridSelection,
    selectionAfter: GridSelection,
  ): void
}
