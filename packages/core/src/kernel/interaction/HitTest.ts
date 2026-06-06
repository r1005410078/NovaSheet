import type { RenderRegion } from '../geometry/FrozenRegions'
import type { RenderFrame } from '../render/RenderFrame'
import type { CellAddress } from '../../engine/selection/SelectionTypes'

export interface HitTestPoint {
  readonly x: number
  readonly y: number
}

/**
 * 把 canvas 坐标转换成单元格索引。
 *
 * Renderer 已经由 `FrozenRegions` 把画面切成 main / frozen regions；命中测试复用同一份
 * `RenderRegion`，这样右冻结列、左冻结列、顶部冻结行和滚动区域不会各算一套坐标。
 */
export function hitTestCell(frame: RenderFrame, point: HitTestPoint): CellAddress | null {
  const regions = [...frame.viewport.regions].sort((a, b) => b.zIndex - a.zIndex)

  for (const region of regions) {
    if (!contains(region, point)) continue
    if (region.rowRange[1] < region.rowRange[0] || region.colRange[1] < region.colRange[0]) {
      continue
    }

    const logicalY = region.scrollOffsetY + point.y - region.rect.y
    const logicalX = region.scrollOffsetX + point.x - region.rect.x
    const rowIndex = frame.rowsAxis.positionToIndex(logicalY)
    const colIndex = frame.colsAxis.positionToIndex(logicalX)

    if (
      rowIndex >= region.rowRange[0] &&
      rowIndex <= region.rowRange[1] &&
      colIndex >= region.colRange[0] &&
      colIndex <= region.colRange[1]
    ) {
      return { rowIndex, colIndex }
    }
  }

  return null
}

function contains(region: RenderRegion, point: HitTestPoint): boolean {
  const { x, y, width, height } = region.rect
  return point.x >= x && point.x < x + width && point.y >= y && point.y < y + height
}
