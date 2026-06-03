import { computeCellRect, type CellAddress, type CellRect, type RenderFrame } from '@novasheet/core'
import { computeRangeOverlayRects } from '@novasheet/web'

/** 合并区感知的编辑器矩形：active cell 落在合并区时锚定整个合并区，否则取单元格 rect。 */
export function computeCellEditorRect(frame: RenderFrame, cell: CellAddress): CellRect | null {
  const mergeRange = (frame.mergeRegions ?? []).find(
    (merge) =>
      cell.rowIndex >= merge.range.startRow &&
      cell.rowIndex <= merge.range.endRow &&
      cell.colIndex >= merge.range.startCol &&
      cell.colIndex <= merge.range.endCol,
  )?.range
  if (mergeRange) {
    const rect = computeRangeOverlayRects(frame, mergeRange).at(-1)
    return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null
  }
  return computeCellRect(frame, cell)
}
