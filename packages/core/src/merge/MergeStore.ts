import type { CellRange } from '../interaction/SelectionModel'

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
  merge(range: CellRange): MergeRegion | null {
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
  unmerge(range: CellRange): readonly MergeRegion[] {
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
      if (inRange(rowIndex, colIndex, region.range)) return region
    }
    return null
  }

  /** 返回所有与 `range` 相交的区域。 */
  getRegionsInRange(range: CellRange): readonly MergeRegion[] {
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
}

function isSingleCell(range: CellRange): boolean {
  return range.startRow === range.endRow && range.startCol === range.endCol
}

function inRange(row: number, col: number, range: CellRange): boolean {
  return row >= range.startRow && row <= range.endRow && col >= range.startCol && col <= range.endCol
}

function rangesIntersect(a: CellRange, b: CellRange): boolean {
  return (
    a.startRow <= b.endRow &&
    a.endRow >= b.startRow &&
    a.startCol <= b.endCol &&
    a.endCol >= b.startCol
  )
}

/** 从 `merge-N` 解析序号 N；非法格式视为 0。 */
function parseMergeIdSeq(id: string): number {
  const seq = Number.parseInt(id.slice('merge-'.length), 10)
  return Number.isNaN(seq) ? 0 : seq
}
