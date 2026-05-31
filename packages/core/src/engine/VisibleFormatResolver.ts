import type { MergeRegion } from '../merge/MergeStore'
import type { MergeStore } from '../merge/MergeStore'
import type { RangeStyleStore } from '../format/RangeStyleStore'
import type { ResolvedCellFormat } from '../format/CellFormat'
import type { CoordinateSpace } from '../view/CoordinateSpace'

/**
 * 把 RAW 键控的 format/merge store 在可见区解析为 **VIEW 坐标** 的帧字段
 * （`cellFormats` / `mergeRegions`）。只读、纯函数式（无 mutation/undo 纠缠）。
 *
 * 从 `DefaultGridEngine.getFrame` 抽出（R1 god-object 收口）：依赖仅 coords + 两个 store，
 * 边界清晰、可独立测试。隐藏/排序/筛选下的 raw↔view 翻译全部经 `CoordinateSpace`。
 */
export class VisibleFormatResolver {
  constructor(
    private readonly formatStore: RangeStyleStore,
    private readonly mergeStore: MergeStore,
    private readonly coords: CoordinateSpace,
  ) {}

  /**
   * 与可见 view 区相交的合并区域，翻译回 VIEW 坐标。任一角隐藏 / 行序非连续则跳过该区域
   * （painter 不画半残合并）。store 空或区空时短路。
   */
  mergeRegions(
    firstRow: number,
    lastRow: number,
    firstCol: number,
    lastCol: number,
  ): readonly MergeRegion[] {
    if (firstRow > lastRow || firstCol > lastCol) return []
    const rawRange = this.coords.viewRangeToRaw({
      startRow: firstRow,
      endRow: lastRow,
      startCol: firstCol,
      endCol: lastCol,
    })
    if (!rawRange) return []
    const rawRegions = this.mergeStore.getRegionsInRange(rawRange)
    if (rawRegions.length === 0) return []
    const result: MergeRegion[] = []
    for (const region of rawRegions) {
      const viewRegion = this.mergeRegionToView(region)
      if (viewRegion) result.push(viewRegion)
    }
    return result
  }

  /**
   * 可见区每个 `(viewRow, viewCol)` 翻译为 raw 查 formatStore，命中以 VIEW 坐标收集；
   * 再为「anchor 滚出可见扫描范围但区域仍相交」的合并补发 anchor 格式（与 paintMergeAnchors 对齐）。
   */
  cellFormats(
    firstRow: number,
    lastRow: number,
    firstCol: number,
    lastCol: number,
    mergeRegions: readonly MergeRegion[],
  ): readonly ResolvedCellFormat[] {
    return this.appendOffscreenMergeAnchorFormats(
      this.resolveVisibleCellFormats(firstRow, lastRow, firstCol, lastCol),
      mergeRegions,
      firstRow,
      lastRow,
      firstCol,
      lastCol,
    )
  }

  private resolveVisibleCellFormats(
    firstRow: number,
    lastRow: number,
    firstCol: number,
    lastCol: number,
  ): readonly ResolvedCellFormat[] {
    if (this.formatStore.getLayerCount() === 0) return []
    if (firstRow > lastRow || firstCol > lastCol) return []
    const result: ResolvedCellFormat[] = []
    const rawCols: number[] = []
    for (let viewCol = firstCol; viewCol <= lastCol; viewCol += 1) {
      rawCols.push(this.coords.viewColToRaw(viewCol))
    }
    for (let viewRow = firstRow; viewRow <= lastRow; viewRow += 1) {
      const rawRow = this.coords.viewRowToRaw(viewRow)
      for (let i = 0; i < rawCols.length; i += 1) {
        const rawCol = rawCols[i]!
        if (rawCol < 0) continue
        const format = this.formatStore.resolveCell(rawRow, rawCol)
        if (format !== undefined) {
          result.push({ rowIndex: viewRow, colIndex: firstCol + i, format })
        }
      }
    }
    return result
  }

  private appendOffscreenMergeAnchorFormats(
    base: readonly ResolvedCellFormat[],
    mergeRegions: readonly MergeRegion[],
    firstRow: number,
    lastRow: number,
    firstCol: number,
    lastCol: number,
  ): readonly ResolvedCellFormat[] {
    if (mergeRegions.length === 0 || this.formatStore.getLayerCount() === 0) return base
    let augmented: ResolvedCellFormat[] | undefined
    for (const region of mergeRegions) {
      const { rowIndex: aRow, colIndex: aCol } = region.anchor
      const insideScan = aRow >= firstRow && aRow <= lastRow && aCol >= firstCol && aCol <= lastCol
      if (insideScan) continue
      const rawRow = this.coords.viewRowToRaw(aRow)
      const rawCol = this.coords.viewColToRaw(aCol)
      if (rawCol < 0) continue
      const format = this.formatStore.resolveCell(rawRow, rawCol)
      if (format === undefined) continue
      if (!augmented) augmented = [...base]
      augmented.push({ rowIndex: aRow, colIndex: aCol, format })
    }
    return augmented ?? base
  }

  /** 单个合并区域 raw → view；隐藏行列或行序非连续返回 null。 */
  private mergeRegionToView(region: MergeRegion): MergeRegion | null {
    const startRow = this.coords.rawRowToView(region.range.startRow)
    if (startRow === -1) return null
    let prevViewRow = startRow
    for (let raw = region.range.startRow + 1; raw <= region.range.endRow; raw += 1) {
      const viewRow = this.coords.rawRowToView(raw)
      if (viewRow === -1 || viewRow !== prevViewRow + 1) return null
      prevViewRow = viewRow
    }
    const endRow = prevViewRow
    const startCol = this.coords.rawColToView(region.range.startCol)
    const endCol = this.coords.rawColToView(region.range.endCol)
    if (startCol === -1 || endCol === -1) return null
    if (endCol - startCol !== region.range.endCol - region.range.startCol) return null
    return {
      id: region.id,
      range: { startRow, endRow, startCol, endCol },
      anchor: { rowIndex: startRow, colIndex: startCol },
    }
  }
}
