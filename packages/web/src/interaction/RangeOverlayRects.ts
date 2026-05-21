import type { CellRange, RenderFrame } from '@novasheet/core'

export interface OverlayRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

const HANDLE_SIZE = 8

export function computeRangeOverlayRects(frame: RenderFrame, range: CellRange): OverlayRect[] {
  const rects: OverlayRect[] = []
  for (const region of frame.viewport.regions) {
    const startRow = Math.max(range.startRow, region.rowRange[0])
    const endRow = Math.min(range.endRow, region.rowRange[1])
    const startCol = Math.max(range.startCol, region.colRange[0])
    const endCol = Math.min(range.endCol, region.colRange[1])
    if (endRow < startRow || endCol < startCol) continue

    const x = region.rect.x + frame.colsAxis.indexToPosition(startCol) - region.scrollOffsetX
    const y = region.rect.y + frame.rowsAxis.indexToPosition(startRow) - region.scrollOffsetY
    const right = region.rect.x + frame.colsAxis.indexToPosition(endCol) - region.scrollOffsetX + frame.colsAxis.getSize(endCol)
    const bottom = region.rect.y + frame.rowsAxis.indexToPosition(endRow) - region.scrollOffsetY + frame.rowsAxis.getSize(endRow)
    rects.push({ x, y, width: right - x, height: bottom - y })
  }
  return rects
}

export function computeFillHandleRect(frame: RenderFrame, range: CellRange): OverlayRect | null {
  const rects = computeRangeOverlayRects(frame, range)
  if (rects.length === 0) return null
  const bottomRight = rects
    .slice()
    .sort((a, b) => a.y + a.height - (b.y + b.height) || a.x + a.width - (b.x + b.width))
    .at(-1)!
  return {
    x: bottomRight.x + bottomRight.width - HANDLE_SIZE / 2,
    y: bottomRight.y + bottomRight.height - HANDLE_SIZE / 2,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
  }
}
