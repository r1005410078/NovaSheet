import {
  DefaultGridEngine,
  FrameScheduler,
  type DataSource,
  type GridEngineOptions,
  type Theme,
} from '@novasheet/core'
import { DomGridHost, WebGridRuntime } from '@novasheet/web'
import { Canvas2DRenderer } from './render/Canvas2DRenderer'
import { HighDPI } from './surface/HighDPI'

export interface GridOptions extends GridEngineOptions {}

export class Grid {
  private container: HTMLElement
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private engine: DefaultGridEngine
  private highDpi: HighDPI
  private renderer: Canvas2DRenderer
  private host: DomGridHost
  private runtime: WebGridRuntime
  private scheduler = new FrameScheduler()

  constructor(container: HTMLElement, options: GridOptions) {
    this.container = container
    this.engine = new DefaultGridEngine(options)

    this.canvas = document.createElement('canvas')
    Object.assign(this.canvas.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      pointerEvents: 'none',
      zIndex: '0',
    })
    this.container.appendChild(this.canvas)

    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('NovaSheet: 2d canvas context unavailable')
    this.ctx = ctx

    this.highDpi = new HighDPI(this.canvas, this.ctx)
    this.renderer = this.createRenderer()

    const runtimeRef: { current: WebGridRuntime | null } = { current: null }
    this.host = new DomGridHost({
      container: this.container,
      scheduler: this.scheduler,
      onScroll: (scrollTop, scrollLeft) =>
        runtimeRef.current!.handleHostScroll(scrollTop, scrollLeft),
      onResize: (w, h, dpr) => runtimeRef.current!.handleHostResize(w, h, dpr),
      onDprChange: (dpr) => runtimeRef.current!.handleHostDprChange(dpr),
    })

    this.runtime = new WebGridRuntime({
      engine: this.engine,
      host: this.host,
      renderer: this.renderer,
      scheduler: this.scheduler,
      onSurfaceResize: (w, h) => this.highDpi.resize(w, h),
    })
    runtimeRef.current = this.runtime

    this.runtime.attach()
  }

  setData(data: DataSource): void {
    this.engine.setData(data)
    this.renderer.destroy()
    this.renderer = this.createRenderer()
    this.runtime.setRenderer(this.renderer)
    this.runtime.afterEngineMutation()
  }

  setTheme(theme: Theme): void {
    this.engine.setTheme(theme)
    this.renderer.setTheme(theme)
    this.runtime.afterEngineMutation()
  }

  setRowHeight(rowIndex: number, height: number): void {
    this.engine.setRowHeight(rowIndex, height)
    this.runtime.afterEngineMutation()
  }

  setColumnWidth(fieldId: string, width: number): void {
    this.engine.setColumnWidth(fieldId, width)
    this.runtime.afterEngineMutation()
  }

  refresh(): void {
    this.runtime.refresh()
  }

  scrollToRow(rowIndex: number, align?: 'start' | 'center' | 'end'): void {
    this.runtime.scrollToRow(rowIndex, align)
  }

  scrollToCell(rowIndex: number, fieldId: string): void {
    this.runtime.scrollToCell(rowIndex, fieldId)
  }

  destroy(): void {
    this.runtime.destroy()
    if (this.canvas.parentNode === this.container) {
      this.container.removeChild(this.canvas)
    }
  }

  /** @internal ResizeObserver path — used by Grid.test.ts */
  _onContainerResize(): void {
    this.runtime.onContainerResize()
  }

  private createRenderer(): Canvas2DRenderer {
    return new Canvas2DRenderer({
      ctx: this.ctx,
      data: this.engine.getData(),
      viewport: this.engine.getViewport(),
      rowsAxis: this.engine.getRowsAxis(),
      colsAxis: this.engine.getColsAxis(),
      theme: this.engine.getTheme(),
      scheduler: this.scheduler,
    })
  }
}
