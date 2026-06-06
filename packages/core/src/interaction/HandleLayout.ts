/**
 * Phase 3.4 — 根据 RenderFrame 计算列/行 resize handle 的屏幕矩形（CSS px）。
 *
 * 命中区在列头底边与行号列右边；由 web 层 `DomHandleLayer` 落成 DOM 节点。
 */

import type { RenderFrame } from '../kernel/render/RenderFrame'

export const RESIZE_HANDLE_HIT_SIZE = 8
export const MIN_RESIZE_SIZE = 20
export const RESIZE_KEYBOARD_STEP = 8
export const RESIZE_KEYBOARD_STEP_LARGE = 32

export type ResizeHandleKind = 'column' | 'row'

export interface ResizeHandleRect {
  readonly kind: ResizeHandleKind
  /** 列：`fieldId`；行：`row-${rowIndex}` */
  readonly id: string
  readonly colIndex?: number
  readonly rowIndex?: number
  readonly fieldId?: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export function computeResizeHandles(frame: RenderFrame): ResizeHandleRect[] {
  const { viewport: snapshot } = frame
  const headerHeight = snapshot.headerHeight
  const rowHeaderWidth = snapshot.rowHeaderWidth
  if (headerHeight <= 0 && rowHeaderWidth <= 0) return []

  const handles: ResizeHandleRect[] = []
  const seen = new Set<string>()

  if (headerHeight > 0) {
    appendColumnHandles(handles, seen, frame, headerHeight)
  }

  if (rowHeaderWidth > 0) {
    appendRowHandles(handles, seen, frame, rowHeaderWidth)
  }

  return handles
}

function appendColumnHandles(
  out: ResizeHandleRect[],
  seen: Set<string>,
  frame: RenderFrame,
  headerHeight: number,
): void {
  const { colsAxis, data } = frame
  const half = RESIZE_HANDLE_HIT_SIZE / 2

  for (const region of frame.viewport.regions) {
    if (region.rowBand !== 'middle') continue
    if (region.colRange[1] < region.colRange[0]) continue

    for (let c = region.colRange[0]; c <= region.colRange[1]; c++) {
      const key = `col:${c}`
      if (seen.has(key)) continue
      seen.add(key)

      const field = data.getSchema().fields[c]
      if (!field) continue

      const right =
        region.rect.x + colsAxis.indexToPosition(c) + colsAxis.getSize(c) - region.scrollOffsetX

      out.push({
        kind: 'column',
        id: field.id,
        fieldId: field.id,
        colIndex: c,
        x: right - half,
        y: 0,
        width: RESIZE_HANDLE_HIT_SIZE,
        height: headerHeight,
      })
    }
  }
}

function appendRowHandles(
  out: ResizeHandleRect[],
  seen: Set<string>,
  frame: RenderFrame,
  rowHeaderWidth: number,
): void {
  const { rowsAxis } = frame
  const half = RESIZE_HANDLE_HIT_SIZE / 2
  const regions = frame.viewport.regions.filter((r) => r.rowRange[1] >= r.rowRange[0])
  if (regions.length === 0) return

  const rowIndices = new Set<number>()
  for (const region of regions) {
    for (let r = region.rowRange[0]; r <= region.rowRange[1]; r++) rowIndices.add(r)
  }

  for (const r of rowIndices) {
    const key = `row:${r}`
    if (seen.has(key)) continue
    seen.add(key)

    const region =
      regions.find((reg) => reg.id === 'main' && r >= reg.rowRange[0] && r <= reg.rowRange[1]) ??
      regions.find((reg) => r >= reg.rowRange[0] && r <= reg.rowRange[1])
    if (!region) continue

    const bottom =
      region.rect.y + rowsAxis.indexToPosition(r) + rowsAxis.getSize(r) - region.scrollOffsetY

    out.push({
      kind: 'row',
      id: `row-${r}`,
      rowIndex: r,
      x: 0,
      y: bottom - half,
      width: rowHeaderWidth,
      height: RESIZE_HANDLE_HIT_SIZE,
    })
  }
}
