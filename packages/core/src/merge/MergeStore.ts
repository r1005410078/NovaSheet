import type { CellRange } from '../engine/selection/SelectionTypes'
import type { RawRange } from '../view/coordinates'
import { isCellInRange, rangesIntersect } from '../geometry/range'
import {
  remapSpanAfterDelete,
  remapSpanAfterInsert,
  remapSpanByIndexMap,
} from '../coords/remap'

/**
 * 一个合并单元格区域。`range` 为矩形覆盖范围，`anchor` 固定为左上角单元格
 * （承载文本与填充绘制）。坐标一律为 **raw** 空间（与 `RangeStyleStore` 一致）。
 */
export interface MergeRegion {
  readonly id: string
  readonly range: CellRange
  readonly anchor: { readonly rowIndex: number; readonly colIndex: number }
}

/**
 * 合并区域存储，按 **raw** 坐标键控。
 *
 * 拒绝单格合并与任何与现存区域重叠的合并；id 单调递增（`merge-1`、`merge-2`…）。
 * `restore` 会把计数器推进到不与还原区域冲突的水位，使 undo 后新建的合并不复用旧 id。
 */
export class MergeStore {
  private regions: MergeRegion[] = []
  private nextCounter = 1

  /**
   * 创建合并区域；anchor 取 `range` 左上角。
   * 单格范围或与现存区域重叠时返回 null（不修改 store）。
   */
  merge(range: RawRange): MergeRegion | null {
    if (isSingleCell(range)) return null
    for (const region of this.regions) {
      if (rangesIntersect(region.range, range)) return null
    }
    const region: MergeRegion = {
      id: `merge-${this.nextCounter}`,
      range,
      anchor: { rowIndex: range.startRow, colIndex: range.startCol },
    }
    this.nextCounter += 1
    this.regions.push(region)
    return region
  }

  /** 移除所有与 `range` 相交的区域并返回被移除的区域（可能为空）。 */
  unmerge(range: RawRange): readonly MergeRegion[] {
    const removed: MergeRegion[] = []
    const kept: MergeRegion[] = []
    for (const region of this.regions) {
      if (rangesIntersect(region.range, range)) removed.push(region)
      else kept.push(region)
    }
    this.regions = kept
    return removed
  }

  /** 返回覆盖 `(rowIndex, colIndex)` 的区域；无命中返回 null。 */
  getRegionAt(rowIndex: number, colIndex: number): MergeRegion | null {
    for (const region of this.regions) {
      if (isCellInRange(rowIndex, colIndex, region.range)) return region
    }
    return null
  }

  /** 返回所有与 `range` 相交的区域。 */
  getRegionsInRange(range: RawRange): readonly MergeRegion[] {
    return this.regions.filter((region) => rangesIntersect(region.range, range))
  }

  snapshot(): readonly MergeRegion[] {
    return [...this.regions]
  }

  /**
   * 还原区域列表（undo/redo）。计数器推进到现存 id 序号最大值之上，
   * 确保还原后新建合并不与既有 id 冲突。
   */
  restore(regions: readonly MergeRegion[]): void {
    this.regions = [...regions]
    this.nextCounter = regions.reduce((max, region) => Math.max(max, parseMergeIdSeq(region.id)), 0) + 1
  }

  /** 行结构变更（raw 坐标）：在 `at` 前插入 `count` 行，平移所有区域的行区间。 */
  remapAfterRowsInserted(at: number, count: number): void {
    if (count <= 0) return
    this.remapRegions((range) => {
      const rows = remapSpanAfterInsert({ start: range.startRow, end: range.endRow }, at, count)
      return { ...range, startRow: rows.start, endRow: rows.end }
    })
  }

  /** 行结构变更（raw 坐标）：删除 `removedSorted` 行；被任一删除行触及的区域整体移除（5-A 不收缩）。 */
  remapAfterRowsDeleted(removedSorted: readonly number[]): void {
    if (removedSorted.length === 0) return
    this.remapRegions((range) => {
      const rows = remapSpanAfterDelete({ start: range.startRow, end: range.endRow }, removedSorted)
      if (!rows || spanTouchedByDeletions(range.startRow, range.endRow, removedSorted)) return null
      return { ...range, startRow: rows.start, endRow: rows.end }
    })
  }

  /** 列结构变更（raw 坐标）：在 `at` 前插入 `count` 列，平移所有区域的列区间。 */
  remapAfterColsInserted(at: number, count: number): void {
    if (count <= 0) return
    this.remapRegions((range) => {
      const cols = remapSpanAfterInsert({ start: range.startCol, end: range.endCol }, at, count)
      return { ...range, startCol: cols.start, endCol: cols.end }
    })
  }

  /** 列结构变更（raw 坐标）：删除 `removedSorted` 列；被任一删除列触及的区域整体移除（5-A 不收缩）。 */
  remapAfterColsDeleted(removedSorted: readonly number[]): void {
    if (removedSorted.length === 0) return
    this.remapRegions((range) => {
      const cols = remapSpanAfterDelete({ start: range.startCol, end: range.endCol }, removedSorted)
      if (!cols || spanTouchedByDeletions(range.startCol, range.endCol, removedSorted)) return null
      return { ...range, startCol: cols.start, endCol: cols.end }
    })
  }

  /** 行 reorder（raw 坐标）：用 `oldIndex → newIndex` map 映射每个区域行区间后重规整。 */
  remapByRowIndexMap(indexMap: ReadonlyMap<number, number>): void {
    this.remapRegions((range) => {
      const rows = remapSpanByIndexMap({ start: range.startRow, end: range.endRow }, indexMap)
      if (!rows) return null
      return { ...range, startRow: rows.start, endRow: rows.end }
    })
  }

  /** 列 reorder（raw 坐标）：用 `oldIndex → newIndex` map 映射每个区域列区间后重规整。 */
  remapByColIndexMap(indexMap: ReadonlyMap<number, number>): void {
    this.remapRegions((range) => {
      const cols = remapSpanByIndexMap({ start: range.startCol, end: range.endCol }, indexMap)
      if (!cols) return null
      return { ...range, startCol: cols.start, endCol: cols.end }
    })
  }

  /** 对每个区域 range 应用 `remap`；返回 null 的区域被移除，其余按新 range 重建 anchor。 */
  private remapRegions(remap: (range: CellRange) => CellRange | null): void {
    const next: MergeRegion[] = []
    for (const region of this.regions) {
      const range = remap(region.range)
      if (!range) continue
      next.push({
        id: region.id,
        range,
        anchor: { rowIndex: range.startRow, colIndex: range.startCol },
      })
    }
    this.regions = next
  }
}

/** 区间 `[start, end]`（含两端）是否与任一被删除索引相交。 */
function spanTouchedByDeletions(start: number, end: number, removedSorted: readonly number[]): boolean {
  for (const removed of removedSorted) {
    if (removed > end) break
    if (removed >= start) return true
  }
  return false
}

function isSingleCell(range: CellRange): boolean {
  return range.startRow === range.endRow && range.startCol === range.endCol
}

/** 从 `merge-N` 解析序号 N；非法格式视为 0。 */
function parseMergeIdSeq(id: string): number {
  const seq = Number.parseInt(id.slice('merge-'.length), 10)
  return Number.isNaN(seq) ? 0 : seq
}
