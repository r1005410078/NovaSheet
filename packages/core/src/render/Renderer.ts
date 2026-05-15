import type { DataSource } from '../data/DataSource'
import type { ChunkedAxis } from '../layout/ChunkedAxis'
import type { Quadrant } from '../layout/FrozenRegions'
import type { Viewport } from '../layout/Viewport'
import type { Theme } from '../theme/Theme'
import { FrameScheduler } from '../util/raf'
import { CellPainter } from './CellPainter'
import { GridLinesPainter } from './GridLinesPainter'
import { HeaderPainter } from './HeaderPainter'

/** Renderer 构造选项 */
export interface RendererOptions {
  /** canvas 2D 绘图上下文 */
  ctx: CanvasRenderingContext2D
  /** 数据源 */
  data: DataSource
  /** 视口状态 */
  viewport: Viewport
  /** 行轴 */
  rowsAxis: ChunkedAxis
  /** 列轴 */
  colsAxis: ChunkedAxis
  /** 当前主题 */
  theme: Theme
  /** 帧调度器，默认创建独立实例 */
  scheduler?: FrameScheduler
}

/** FrameScheduler 中注册 Renderer 刷新任务所用的 key */
const RENDERER_KEY = 'renderer:flush'

/** 负责单帧全量绘制：清空背景 → 单元格 → 网格线 → 表头 */
export class Renderer {
  /** canvas 2D 绘图上下文 */
  private ctx: CanvasRenderingContext2D
  /** 当前数据源 */
  private data: DataSource
  /** 视口状态 */
  private viewport: Viewport
  /** 行轴 */
  private rowsAxis: ChunkedAxis
  /** 列轴 */
  private colsAxis: ChunkedAxis
  /** 当前主题 */
  private theme: Theme
  /** 帧调度器（与 Grid 共享同一实例） */
  private scheduler: FrameScheduler
  /** 单元格内容绘制器 */
  private cellPainter: CellPainter
  /** 网格线绘制器 */
  private gridLinesPainter: GridLinesPainter
  /** 表头绘制器 */
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

  /** 切换主题并同步所有 Painter，触发重绘 */
  setTheme(theme: Theme): void {
    this.theme = theme
    this.cellPainter.setTheme(theme)
    this.gridLinesPainter.setTheme(theme)
    this.headerPainter.setTheme(theme)
    this.invalidate()
  }

  /** 替换数据源并触发重绘 */
  setData(data: DataSource): void {
    this.data = data
    this.invalidate()
  }

  /** 将重绘任务注册到 FrameScheduler，下一帧执行（幂等，重复调用仅保留最后一次） */
  invalidate(): void {
    this.scheduler.schedule(RENDERER_KEY, () => this.paint())
  }

  /** 取消待执行的重绘任务 */
  destroy(): void {
    this.scheduler.cancel(RENDERER_KEY)
  }

  paint(): void {
    const snapshot = this.viewport.snapshot()
    const { contentRect, headerHeight, quadrants } = snapshot

    // 1) 清空画布 / 填充背景色
    this.ctx.fillStyle = this.theme.colors.background
    this.ctx.fillRect(0, 0, contentRect.width, contentRect.height)

    // 2) 每帧设置一次字体（避免在单元格循环中反复赋值）
    this.ctx.font = `${this.theme.metrics.fontSize}px ${this.theme.metrics.fontFamily}`

    // 3) 预取可见行（InMemoryDataSource 为同步路径；异步源返回 Promise 暂忽略）
    const main = quadrants.main
    if (main.rowRange[1] >= main.rowRange[0]) {
      const maybe = this.data.getRows(main.rowRange[0], main.rowRange[1])
      // M1：仅支持同步数据源，暂时忽略 Promise 返回值
      void maybe
    }

    // 4) 绘制主象限（单元格 + 网格线）
    this.paintQuadrant(main)

    // 5) 表头（最后绘制，始终覆盖在内容之上）
    this.headerPainter.paint(this.ctx, {
      schema: this.data.getSchema(),
      colsAxis: this.colsAxis,
      colRange: main.colRange,
      width: contentRect.width,
    })

    // M1 不绘制冻结象限（FrozenRegions 仅返回 main）；M3 将遍历 quadrants 中所有象限
    void headerHeight
  }

  private paintQuadrant(quadrant: Quadrant): void {
    const { rowRange, colRange, rect } = quadrant
    if (rowRange[1] < rowRange[0] || colRange[1] < colRange[0]) return

    const schema = this.data.getSchema()
    for (let r = rowRange[0]; r <= rowRange[1]; r++) {
      const yTop = this.rowsAxis.indexToPosition(r)
      const rowHeight = this.rowsAxis.getSize(r)
      const cellY = rect.y + yTop // M1：暂不减去 scrollY（滚动偏移固定为 0）

      for (let c = colRange[0]; c <= colRange[1]; c++) {
        const field = schema.fields[c]
        if (!field) continue
        const xLeft = this.colsAxis.indexToPosition(c)
        const colWidth = this.colsAxis.getSize(c)
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
