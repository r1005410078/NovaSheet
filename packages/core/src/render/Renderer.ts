import type { DataSource } from '../data/DataSource'
import type { ChunkedAxis } from '../layout/ChunkedAxis'
import type { Quadrant } from '../layout/FrozenRegions'
import type { Viewport } from '../layout/Viewport'
import type { Theme } from '../theme/Theme'
import { FrameScheduler } from '../util/raf'
import { CellPainter } from './CellPainter'
import { GridLinesPainter } from './GridLinesPainter'
import { HeaderPainter } from './HeaderPainter'

export interface RendererOptions {
  ctx: CanvasRenderingContext2D
  data: DataSource
  viewport: Viewport
  rowsAxis: ChunkedAxis
  colsAxis: ChunkedAxis
  theme: Theme
  scheduler?: FrameScheduler
}

const RENDERER_KEY = 'renderer:flush'

export class Renderer {
  private ctx: CanvasRenderingContext2D
  private data: DataSource
  private viewport: Viewport
  private rowsAxis: ChunkedAxis
  private colsAxis: ChunkedAxis
  private theme: Theme
  private scheduler: FrameScheduler
  private cellPainter: CellPainter
  private gridLinesPainter: GridLinesPainter
  private headerPainter: HeaderPainter

  constructor(opts: RendererOptions) {
    this.ctx = opts.ctx
    this.data = opts.data
    this.viewport = opts.viewport
    this.rowsAxis = opts.rowsAxis
    this.colsAxis = opts.colsAxis
    this.theme = opts.theme
    this.scheduler = opts.scheduler ?? new FrameScheduler()
    this.cellPainter = new CellPainter(this.theme)
    this.gridLinesPainter = new GridLinesPainter(this.theme)
    this.headerPainter = new HeaderPainter(this.theme)
  }

  setTheme(theme: Theme): void {
    this.theme = theme
    this.cellPainter.setTheme(theme)
    this.gridLinesPainter.setTheme(theme)
    this.headerPainter.setTheme(theme)
    this.invalidate()
  }

  setData(data: DataSource): void {
    this.data = data
    this.invalidate()
  }

  invalidate(): void {
    this.scheduler.schedule(RENDERER_KEY, () => this.paint())
  }

  paint(): void {
    const snapshot = this.viewport.snapshot()
    const { contentRect, headerHeight, quadrants } = snapshot

    // 1) Clear / background
    this.ctx.fillStyle = this.theme.colors.background
    this.ctx.fillRect(0, 0, contentRect.width, contentRect.height)

    // 2) Set font once per frame
    this.ctx.font = `${this.theme.metrics.fontSize}px ${this.theme.metrics.fontFamily}`

    // 3) Prefetch visible rows (sync path for InMemoryDataSource)
    const main = quadrants.main
    if (main.rowRange[1] >= main.rowRange[0]) {
      const maybe = this.data.getRows(main.rowRange[0], main.rowRange[1])
      // Phase 1 M1: synchronous source only; ignore Promise return for now
      void maybe
    }

    // 4) Draw main quadrant
    this.paintQuadrant(main)

    // 5) Header (always on top)
    this.headerPainter.paint(this.ctx, {
      schema: this.data.getSchema(),
      colsAxis: this.colsAxis,
      colRange: main.colRange,
      width: contentRect.width,
    })

    // Note: M1 does not draw frozen quadrants (FrozenRegions stub returns only main).
    // M3 will extend paint() to iterate all quadrants present in `quadrants`.
    void headerHeight
  }

  private paintQuadrant(quadrant: Quadrant): void {
    const { rowRange, colRange, rect } = quadrant
    if (rowRange[1] < rowRange[0] || colRange[1] < colRange[0]) return

    const schema = this.data.getSchema()
    for (let r = rowRange[0]; r <= rowRange[1]; r++) {
      const yTop = this.rowsAxis.indexToPosition(r)
      const yBottom = this.rowsAxis.indexToPosition(r + 1)
      const rowHeight = (r + 1 >= this.rowsAxis.getCount())
        ? this.rowsAxis.getTotalSize() - yTop
        : yBottom - yTop
      const cellY = rect.y + yTop // M1: no scroll subtraction (scrollY = 0)

      for (let c = colRange[0]; c <= colRange[1]; c++) {
        const field = schema.fields[c]
        if (!field) continue
        const xLeft = this.colsAxis.indexToPosition(c)
        const xRight = this.colsAxis.indexToPosition(c + 1)
        const colWidth = (c + 1 >= this.colsAxis.getCount())
          ? this.colsAxis.getTotalSize() - xLeft
          : xRight - xLeft
        const cellX = rect.x + xLeft
        const value = this.data.getCell(r, field.id)
        this.cellPainter.paint(this.ctx, {
          value,
          rect: { x: cellX, y: cellY, width: colWidth, height: rowHeight },
          field,
        })
      }
    }

    this.gridLinesPainter.paint(this.ctx, {
      rowsAxis: this.rowsAxis,
      colsAxis: this.colsAxis,
      rowRange,
      colRange,
      rect,
    })
  }
}
