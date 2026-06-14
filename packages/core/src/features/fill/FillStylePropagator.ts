import type { CellRange } from '../../kernel/coords/SelectionTypes'
import type { RangeStyleStore } from '../format/RangeStyleStore'
import type { FormatLayer } from '../../kernel/protocol/FormatTypes'
import type { MergeStore, MergeRegion } from '../merge/MergeStore'
import type { CoordinateSpace } from '../../kernel/coords/CoordinateSpace'
import { asRawRange, type RawRange } from '../../kernel/coords/coordinates'
import type { FillDirection, FillMergeSnap } from './FillTarget'
import { positiveModulo } from './FillSeries'
import type { CellAttachmentStore } from '../attachment/CellAttachmentStore'
import type { CellAttachmentSnapshot } from '../../kernel/protocol/AttachmentTypes'

/** propagateFillStyles 返回的 store 快照（供 commitFill 组装 fill undo 命令）。 */
export interface FillStyleSnapshots {
  formatBefore?: readonly FormatLayer[]
  formatAfter?: readonly FormatLayer[]
  mergeBefore?: readonly MergeRegion[]
  mergeAfter?: readonly MergeRegion[]
  attachmentBefore?: CellAttachmentSnapshot
  attachmentAfter?: CellAttachmentSnapshot
}

/**
 * 填充柄「携带格式/合并」的平铺逻辑（Phase 5-A fill）。
 *
 * 从 `DefaultGridEngine` 抽出（R1 god-object 收口）：依赖仅 coords + 两个 store，
 * 直接 mutate store 但**不碰 undoStack/selection**——快照由本类返回、undo 命令由 commitFill 组装。
 */
export class FillStylePropagator {
  constructor(
    private readonly formatStore: RangeStyleStore,
    private readonly mergeStore: MergeStore,
    private readonly attachmentStore: CellAttachmentStore,
    private readonly coords: CoordinateSpace,
  ) {}

  /**
   * 返回 view `source` 的合并块吸附尺寸。source 含合并时返回其 raw 跨度，
   * 否则（无合并或映射非连续）返回 `{ rowSpan: 1, colSpan: 1 }`，让填充柄不吸附。
   */
  getFillMergeSnap(source: CellRange): FillMergeSnap {
    const rawSource = this.coords.viewRangeToRaw(source)
    if (!rawSource || this.mergeStore.getRegionsInRange(rawSource).length === 0) {
      return { rowSpan: 1, colSpan: 1 }
    }
    return {
      rowSpan: rawSource.endRow - rawSource.startRow + 1,
      colSpan: rawSource.endCol - rawSource.startCol + 1,
    }
  }

  /**
   * 把源选区的格式（填充色/边框/textWrap/valueFormat）与合并区按填充轴平铺到 fill 目标区，
   * 并返回供 undo/redo 恢复的 store 快照。源或目标的 view→raw 映射非连续时返回空对象（不改动任何 store）。
   */
  propagateFillStyles(source: CellRange, fill: CellRange, direction: FillDirection): FillStyleSnapshots {
    const rawSource = this.coords.viewRangeToRaw(source)
    const rawFill = this.coords.viewRangeToRaw(fill)
    if (!rawSource || !rawFill) return {}

    const formatBefore = this.formatStore.snapshot()
    const mergeBefore = this.mergeStore.snapshot()
    const attachmentBefore = this.attachmentStore.snapshot()
    this.tileFillFormat(rawSource, rawFill, direction)
    this.tileFillMerge(rawSource, rawFill, direction)
    this.tileFillAttachment(rawSource, rawFill, direction)
    return {
      formatBefore,
      formatAfter: this.formatStore.snapshot(),
      mergeBefore,
      mergeAfter: this.mergeStore.snapshot(),
      attachmentBefore,
      attachmentAfter: this.attachmentStore.snapshot(),
    }
  }

  /**
   * 格式平铺：清空目标区的 fill/边框/textWrap/valueFormat 后，按填充轴的 `positiveModulo`
   * 取对应源格的已解析格式重写，使目标格精确等于源（源无格式则清除目标陈旧格式，对齐 Google
   * 填充覆盖语义）。坐标均为 raw。
   */
  private tileFillFormat(rawSource: RawRange, rawFill: RawRange, direction: FillDirection): void {
    const sourceHasFormat = this.formatStore.resolveVisible(rawSource).length > 0
    const targetHasFormat = this.formatStore.resolveVisible(rawFill).length > 0
    if (!sourceHasFormat && !targetHasFormat) return

    this.formatStore.clearFill(rawFill)
    this.formatStore.clearBorders(rawFill)
    this.formatStore.clearTextWrap(rawFill)
    this.formatStore.clearValueFormat(rawFill)
    if (!sourceHasFormat) return

    const sRows = rawSource.endRow - rawSource.startRow + 1
    const sCols = rawSource.endCol - rawSource.startCol + 1
    const vertical = direction === 'down' || direction === 'up'
    for (let row = rawFill.startRow; row <= rawFill.endRow; row += 1) {
      for (let col = rawFill.startCol; col <= rawFill.endCol; col += 1) {
        const srcRow = vertical
          ? rawSource.startRow + positiveModulo(row - rawSource.startRow, sRows)
          : row
        const srcCol = vertical
          ? col
          : rawSource.startCol + positiveModulo(col - rawSource.startCol, sCols)
        const fmt = this.formatStore.resolveCell(srcRow, srcCol)
        if (!fmt) continue
        const target = asRawRange({ startRow: row, endRow: row, startCol: col, endCol: col })
        if (fmt.fillColor !== undefined) this.formatStore.apply(target, { fillColor: fmt.fillColor })
        if (fmt.borders !== undefined) this.formatStore.apply(target, { borders: fmt.borders })
        if (fmt.textWrap !== undefined) this.formatStore.apply(target, { textWrap: fmt.textWrap })
        if (fmt.valueFormat !== undefined) this.formatStore.apply(target, { valueFormat: fmt.valueFormat })
      }
    }
  }

  /**
   * 附件平铺：清空目标区每格附件后，按填充轴取源格附件重写（源无 → 清除目标陈旧，对齐 Google）。
   * 遍历 store 内全部 namespace；仅当 store 含附件时执行，否则快速返回。
   */
  // 注：fill 遍历 attachmentStore.namespaces()（内存全 ns，无需 serialize）；clipboard 用
  // codecRegistry（仅可序列化 ns）。fill 可携无 codec 附件、clipboard 不行——刻意不对称（F8）。
  private tileFillAttachment(rawSource: RawRange, rawFill: RawRange, direction: FillDirection): void {
    const namespaces = this.attachmentStore.namespaces()
    if (namespaces.length === 0) return
    const sRows = rawSource.endRow - rawSource.startRow + 1
    const sCols = rawSource.endCol - rawSource.startCol + 1
    const vertical = direction === 'down' || direction === 'up'
    for (let row = rawFill.startRow; row <= rawFill.endRow; row += 1) {
      for (let col = rawFill.startCol; col <= rawFill.endCol; col += 1) {
        const srcRow = vertical
          ? rawSource.startRow + positiveModulo(row - rawSource.startRow, sRows)
          : row
        const srcCol = vertical
          ? col
          : rawSource.startCol + positiveModulo(col - rawSource.startCol, sCols)
        for (const ns of namespaces) {
          const data = this.attachmentStore.get(ns, srcRow, srcCol)
          this.attachmentStore.set(ns, row, col, data) // data===undefined 即清除目标陈旧
        }
      }
    }
  }

  /**
   * 合并平铺：源合并块沿填充轴按整块步长复制；放不下整块的尾部 tile 跳过，与既有合并相交
   * 由 `MergeStore.merge` 拒绝（返回 null）后跳过。坐标均为 raw。
   */
  private tileFillMerge(rawSource: RawRange, rawFill: RawRange, direction: FillDirection): void {
    const regions = this.mergeStore.getRegionsInRange(rawSource)
    // 填充覆盖目标区时一律取消其已有合并（与 Google 表格一致）：单格源拖过合并会恢复成普通格；
    // 合并源还会接着按块平铺（先清除也避免源块平铺与旧合并相交被拒绝）。
    this.mergeStore.unmerge(rawFill)
    if (regions.length === 0) return
    const sRows = rawSource.endRow - rawSource.startRow + 1
    const sCols = rawSource.endCol - rawSource.startCol + 1
    const vertical = direction === 'down' || direction === 'up'
    const blockSize = vertical ? sRows : sCols
    const span = vertical
      ? rawFill.endRow - rawFill.startRow + 1
      : rawFill.endCol - rawFill.startCol + 1
    const maxTiles = Math.ceil(span / blockSize) + 1

    for (const region of regions) {
      for (let k = 1; k <= maxTiles; k += 1) {
        const candidate = shiftRangeForFill(region.range, direction, k * blockSize)
        if (!rangeWithin(candidate, rawFill)) continue
        this.mergeStore.merge(asRawRange(candidate)) // region.range 处 raw 空间，平移后仍 raw
      }
    }
  }
}

/** 沿填充方向把 `range` 整体平移 `delta` 格（down/right 为正向，up/left 为反向）。 */
function shiftRangeForFill(range: CellRange, direction: FillDirection, delta: number): CellRange {
  switch (direction) {
    case 'down':
      return { ...range, startRow: range.startRow + delta, endRow: range.endRow + delta }
    case 'up':
      return { ...range, startRow: range.startRow - delta, endRow: range.endRow - delta }
    case 'right':
      return { ...range, startCol: range.startCol + delta, endCol: range.endCol + delta }
    case 'left':
      return { ...range, startCol: range.startCol - delta, endCol: range.endCol - delta }
  }
}

/** `inner` 是否完全落在 `outer` 矩形内。 */
function rangeWithin(inner: CellRange, outer: CellRange): boolean {
  return (
    inner.startRow >= outer.startRow &&
    inner.endRow <= outer.endRow &&
    inner.startCol >= outer.startCol &&
    inner.endCol <= outer.endCol
  )
}
