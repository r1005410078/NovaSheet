import { FrozenRegions, type FrozenConfig } from '../layout/FrozenRegions'
import type { ChunkedAxis } from '../layout/ChunkedAxis'
import { Viewport } from '../layout/Viewport'

export interface ViewportRebuildParams {
  rowsAxis: ChunkedAxis
  colsAxis: ChunkedAxis
  previousViewport: Viewport
  frozenConfig: FrozenConfig
}

export interface ViewportRebuildResult {
  frozen: FrozenRegions
  viewport: Viewport
}

/** Rebuilds axis-bound viewport/frozen objects while preserving viewport state. */
export class ViewportRebuilder {
  rebuild(params: ViewportRebuildParams): ViewportRebuildResult {
    const snap = params.previousViewport.snapshot()
    const frozen = new FrozenRegions(params.rowsAxis, params.colsAxis, params.frozenConfig)
    const viewport = new Viewport(params.rowsAxis, params.colsAxis, frozen)
    viewport.setHeaderHeight(snap.headerHeight)
    viewport.setRowHeaderWidth(snap.rowHeaderWidth)
    viewport.setSize(snap.contentRect.width, snap.contentRect.height)
    viewport.setScroll(snap.scrollX, snap.scrollY)
    return { frozen, viewport }
  }
}
