/**
 * Phase 3.5 — 把单元格索引映射到屏幕矩形（CSS px，与 HitTest 同一套 region）。
 */

import type { RenderFrame } from '../render/RenderFrame'
import type { CellAddress } from '../../engine/selection/SelectionTypes'

export interface CellRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export function computeCellRect(frame: RenderFrame, cell: CellAddress): CellRect | null {
  const regions = [...frame.viewport.regions].sort((a, b) => b.zIndex - a.zIndex)

  for (const region of regions) {
    if (region.rowBand !== 'middle') continue
    if (
      cell.rowIndex < region.rowRange[0] ||
      cell.rowIndex > region.rowRange[1] ||
      cell.colIndex < region.colRange[0] ||
      cell.colIndex > region.colRange[1]
    ) {
      continue
    }

    const top = frame.rowsAxis.indexToPosition(cell.rowIndex)
    const left = frame.colsAxis.indexToPosition(cell.colIndex)
    const height = frame.rowsAxis.getSize(cell.rowIndex)
    const width = frame.colsAxis.getSize(cell.colIndex)

    return {
      x: region.rect.x + left - region.scrollOffsetX,
      y: region.rect.y + top - region.scrollOffsetY,
      width,
      height,
    }
  }

  return null
}
