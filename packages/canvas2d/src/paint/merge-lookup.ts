/**
 * 合并单元格的逐帧查找表（Phase 5-A 合并绘制）。
 *
 * 把 `RenderFrame.mergeRegions`（view 坐标）展开为「覆盖单元格 → 所属区域」的 Map，
 * 供 renderer 文本循环与 FormatFillPainter 共用：判定某 `(row, col)` 是否被合并覆盖、
 * 是否为 anchor，以及取出区域以计算合并矩形。坐标已是 view 空间，不做任何翻译。
 */

import type { CellRange, MergeRegion } from '@novasheet/core'

/** 只需 getSize 的轴契约（duck-typed，便于单测注入最简 stub）。 */
interface SizedAxis {
  getSize(index: number): number
}

/** 覆盖单元格键：`${rowIndex}:${colIndex}`。 */
function cellKey(rowIndex: number, colIndex: number): string {
  return `${rowIndex}:${colIndex}`
}

/**
 * 计算合并区域的视觉宽高：沿 range 各 col/row 累加 `getSize()`。
 *
 * 用 `getSize()` 逐格求和而非 `indexToPosition` 差分——后者在末行/末列因 clamp 返回 0
 * （CLAUDE.md 不变量 #7）。anchor 像素原点仍由调用方用 `indexToPosition(anchor)` 计算。
 */
export function mergedRectSize(
  range: CellRange,
  rowsAxis: SizedAxis,
  colsAxis: SizedAxis,
): { width: number; height: number } {
  let width = 0
  for (let c = range.startCol; c <= range.endCol; c += 1) width += colsAxis.getSize(c)
  let height = 0
  for (let r = range.startRow; r <= range.endRow; r += 1) height += rowsAxis.getSize(r)
  return { width, height }
}

/**
 * 合并查找表：覆盖单元格 → 所属合并区域。
 *
 * 仅展开传入区域所覆盖的离散单元格（合并区域通常很小），不与 1M 行尺度耦合。
 */
export class MergeLookup {
  private readonly coveredCells = new Map<string, MergeRegion>()
  private readonly distinctRegions: readonly MergeRegion[]

  constructor(regions: readonly MergeRegion[]) {
    this.distinctRegions = regions
    for (const region of regions) {
      const { startRow, endRow, startCol, endCol } = region.range
      for (let r = startRow; r <= endRow; r += 1) {
        for (let c = startCol; c <= endCol; c += 1) {
          this.coveredCells.set(cellKey(r, c), region)
        }
      }
    }
  }

  /** 本帧所有合并区域（去重，保持构造顺序）。anchor 绘制 pass 用它独立绘制 anchor。 */
  get regions(): readonly MergeRegion[] {
    return this.distinctRegions
  }

  /** 是否存在任何合并区域。空表时调用方可走原始非合并路径。 */
  get isEmpty(): boolean {
    return this.coveredCells.size === 0
  }

  /** 返回覆盖 `(rowIndex, colIndex)` 的合并区域；未覆盖返回 undefined。 */
  regionAt(rowIndex: number, colIndex: number): MergeRegion | undefined {
    return this.coveredCells.get(cellKey(rowIndex, colIndex))
  }

  /** `(rowIndex, colIndex)` 是否为某合并区域的 anchor（承载文本/填充）。 */
  isAnchor(region: MergeRegion, rowIndex: number, colIndex: number): boolean {
    return region.anchor.rowIndex === rowIndex && region.anchor.colIndex === colIndex
  }
}
