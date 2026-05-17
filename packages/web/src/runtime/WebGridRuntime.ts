import type { GridEngine } from '@novasheet/core'
import { FrameScheduler } from '@novasheet/core'
import type { WebHost } from '../host/WebHost'
import type { WebRenderer } from '../render/WebRenderer'
import { ScrollMapper } from '../scroll/ScrollMapper'

export interface WebGridRuntimeOptions {
  engine: GridEngine
  host: WebHost
  renderer: WebRenderer
  scheduler?: FrameScheduler
  /** Resize canvas bitmap (HighDPI etc.) — renderer.resize is still a stub for Canvas2D. */
  onSurfaceResize?: (width: number, height: number, dpr: number) => void
}

export class WebGridRuntime {
  private engine: GridEngine
  private host: WebHost
  private renderer: WebRenderer
  private scheduler: FrameScheduler
  private scrollMapper: ScrollMapper
  private onSurfaceResize?: WebGridRuntimeOptions['onSurfaceResize']
  private destroyed = false

  constructor(opts: WebGridRuntimeOptions) {
    this.engine = opts.engine
    this.host = opts.host
    this.renderer = opts.renderer
    this.scheduler = opts.scheduler ?? new FrameScheduler()
    this.onSurfaceResize = opts.onSurfaceResize
    this.scrollMapper = new ScrollMapper()
  }

  attach(): void {
    this.host.attach()
    const { width, height } = this.host.getContainerSize()
    const dpr = this.host.getDpr()
    this.engine.setViewportSize(width, height)
    this.onSurfaceResize?.(width, height, dpr)
    this.resizeSpacer()
    this.paintSync()
  }

  setRenderer(renderer: WebRenderer): void {
    this.renderer = renderer
  }

  refresh(): void {
    this.invalidate()
  }

  afterEngineMutation(): void {
    const { width, height } = this.host.getContainerSize()
    this.engine.setViewportSize(width, height)
    this.resizeSpacer()
    this.remapScroll()
    this.refresh()
  }

  scrollToRow(rowIndex: number, align: 'start' | 'center' | 'end' = 'start'): void {
    const rowsAxis = this.engine.getRowsAxis()
    if (rowIndex < 0 || rowIndex >= rowsAxis.getCount()) return
    const top = rowsAxis.indexToPosition(rowIndex)
    const size = rowsAxis.getSize(rowIndex)
    const { height: clientH } = this.host.getContainerSize()
    const vpContentH = clientH - this.engine.getTheme().metrics.headerHeight
    let logicalY: number
    if (align === 'start') logicalY = top
    else if (align === 'end') logicalY = top + size - vpContentH
    else logicalY = top + size / 2 - vpContentH / 2

    const scrollTop = this.logicalToScrollY(logicalY)
    const { scrollLeft } = this.host.getScrollPosition()
    this.host.scrollTo(scrollTop, scrollLeft)
  }

  scrollToCell(rowIndex: number, fieldId: string): void {
    const rowsAxis = this.engine.getRowsAxis()
    const colsAxis = this.engine.getColsAxis()
    const colIndex = this.engine.getColumnIndex(fieldId)
    if (rowIndex < 0 || rowIndex >= rowsAxis.getCount()) return
    if (colIndex < 0) return

    const top = rowsAxis.indexToPosition(rowIndex)
    const left = colsAxis.indexToPosition(colIndex)
    const scrollTop = this.logicalToScrollY(top)
    const scrollLeft = this.logicalToScrollX(left)
    this.host.scrollTo(scrollTop, scrollLeft)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.scheduler.cancel('renderer:flush')
    this.renderer.destroy()
    this.host.destroy()
  }

  handleHostScroll(scrollTop: number, scrollLeft: number): void {
    const { logicalX, logicalY } = this.mapScrollToLogical(scrollTop, scrollLeft)
    this.engine.setScroll(logicalX, logicalY)
    this.invalidate()
  }

  handleHostResize(cssWidth: number, cssHeight: number, dpr: number): void {
    if (this.destroyed) return
    this.engine.setViewportSize(cssWidth, cssHeight)
    this.onSurfaceResize?.(cssWidth, cssHeight, dpr)
    this.renderer.resize(cssWidth, cssHeight, dpr)
    this.remapScroll()
    this.refresh()
  }

  handleHostDprChange(dpr: number): void {
    if (this.destroyed) return
    const { width, height } = this.host.getContainerSize()
    this.onSurfaceResize?.(width, height, dpr)
    this.renderer.resize(width, height, dpr)
    this.invalidate()
  }

  /** Exposed for Grid integration tests (ResizeObserver wiring). */
  onContainerResize(): void {
    const { width, height } = this.host.getContainerSize()
    this.handleHostResize(width, height, this.host.getDpr())
  }

  private invalidate(): void {
    if (this.destroyed) return
    this.scheduler.schedule('renderer:flush', () => {
      if (this.destroyed) return
      const frame = this.engine.getFrame()
      this.renderer.render(frame)
    })
  }

  private paintSync(): void {
    const frame = this.engine.getFrame()
    this.renderer.render(frame)
  }

  private mapScrollToLogical(
    scrollTop: number,
    scrollLeft: number,
  ): { logicalX: number; logicalY: number } {
    const headerH = this.engine.getTheme().metrics.headerHeight
    const contentH = this.engine.getRowsTotalSize()
    const contentW = this.engine.getColsTotalSize()
    const spacerH = this.scrollMapper.computeSpacerSize(contentH + headerH)
    const spacerW = this.scrollMapper.computeSpacerSize(contentW)
    const { width: clientW, height: clientH } = this.host.getContainerSize()
    return {
      logicalX: this.scrollMapper.scrollToLogical(scrollLeft, spacerW, contentW, clientW),
      logicalY: this.scrollMapper.scrollToLogical(scrollTop, spacerH, contentH + headerH, clientH),
    }
  }

  private logicalToScrollY(logicalY: number): number {
    const headerH = this.engine.getTheme().metrics.headerHeight
    const contentH = this.engine.getRowsTotalSize()
    const spacerH = this.scrollMapper.computeSpacerSize(contentH + headerH)
    const { height: clientH } = this.host.getContainerSize()
    return this.scrollMapper.logicalToScroll(logicalY, spacerH, contentH + headerH, clientH)
  }

  private logicalToScrollX(logicalX: number): number {
    const contentW = this.engine.getColsTotalSize()
    const spacerW = this.scrollMapper.computeSpacerSize(contentW)
    const { width: clientW } = this.host.getContainerSize()
    return this.scrollMapper.logicalToScroll(logicalX, spacerW, contentW, clientW)
  }

  private remapScroll(): void {
    const { scrollTop, scrollLeft } = this.host.getScrollPosition()
    const { logicalX, logicalY } = this.mapScrollToLogical(scrollTop, scrollLeft)
    this.engine.setScroll(logicalX, logicalY)
  }

  private resizeSpacer(): void {
    const headerH = this.engine.getTheme().metrics.headerHeight
    const w = this.scrollMapper.computeSpacerSize(this.engine.getColsTotalSize())
    const h = this.scrollMapper.computeSpacerSize(this.engine.getRowsTotalSize() + headerH)
    this.host.setScrollSize(w, h)
  }
}
