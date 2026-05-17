import {
  DefaultGridEngine,
  FrameScheduler,
  type DataSource,
  type GridEngineOptions,
  type Theme,
} from '@novasheet/core'
import { Canvas2DRenderer, HighDPI } from '@novasheet/web-canvas2d'
import type { GridController } from '../grid/GridController'
import { DomGridHost } from '../host/DomGridHost'
import { WebGridRuntime } from '../runtime/WebGridRuntime'

/**
 * Canvas2D 渲染后端装配（`Grid` 在 `renderer: 'canvas2d'` 时使用）。
 *
 * 职责划分：
 *   - 本类：创建 canvas / HighDPI / `Canvas2DRenderer`，并交给 `WebGridRuntime` 编排
 *   - `DomGridHost`：scrollHost、spacer、ResizeObserver、DPR 监听
 *   - `WebGridRuntime`：滚动映射、spacer 尺寸、RAF、`setData` 换 renderer
 *   - `DefaultGridEngine`（core）：数据、轴、viewport 逻辑状态
 *
 * Host 回调在 `attach()` 之后才触发，故可在 `this.runtime` 赋值后安全闭包引用。
 */
export class Canvas2DBackend implements GridController {
  private container: HTMLElement
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private engine: DefaultGridEngine
  private highDpi: HighDPI
  private renderer: Canvas2DRenderer
  private host: DomGridHost
  private runtime!: WebGridRuntime
  private scheduler = new FrameScheduler()

  constructor(container: HTMLElement, options: GridEngineOptions) {
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

    this.host = new DomGridHost({
      container: this.container,
      scheduler: this.scheduler,
      onScroll: (scrollTop, scrollLeft) =>
        this.runtime.handleHostScroll(scrollTop, scrollLeft),
      onResize: (w, h, dpr) => this.runtime.handleHostResize(w, h, dpr),
      onDprChange: (dpr) => this.runtime.handleHostDprChange(dpr),
    })

    this.runtime = new WebGridRuntime({
      engine: this.engine,
      host: this.host,
      renderer: this.renderer,
      scheduler: this.scheduler,
      onSurfaceResize: (w, h) => this.highDpi.resize(w, h),
    })

    this.runtime.attach()
  }

  setData(data: DataSource): void {
    this.renderer = this.runtime.setData(data, () => this.createRenderer()) as Canvas2DRenderer
  }

  setTheme(theme: Theme): void {
    this.runtime.setTheme(theme, (renderer) => {
      (renderer as Canvas2DRenderer).setTheme(theme)
    })
  }

  setRowHeight(rowIndex: number, height: number): void {
    this.runtime.setRowHeight(rowIndex, height)
  }

  setColumnWidth(fieldId: string, width: number): void {
    this.runtime.setColumnWidth(fieldId, width)
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

  _onContainerResize(): void {
    this.runtime.onContainerResize()
  }

  /** 用当前 engine 状态构造新的 `Canvas2DRenderer`（`setData` 后轴/viewport 会重建）。 */
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
