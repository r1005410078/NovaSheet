import type { DataSource } from './data/DataSource'
import { ChunkedAxis } from './layout/ChunkedAxis'
import { FrozenRegions } from './layout/FrozenRegions'
import { Viewport } from './layout/Viewport'
import { HighDPI } from './render/HighDPI'
import { Renderer } from './render/Renderer'
import { denseGridTheme } from './theme/denseGridTheme'
import type { Theme } from './theme/Theme'

/** Grid 初始化选项 */
export interface GridOptions {
  /** 数据源 */
  data: DataSource
  /** 主题，默认使用 denseGridTheme */
  theme?: Theme
  /** 冻结行数 */
  frozenRows?: number
  /** 冻结列数 */
  frozenCols?: number
  /** 覆盖主题的默认行高（px） */
  defaultRowHeight?: number
}

/** NovaSheet 表格的公共门面类，负责初始化、协调各子系统并对外暴露变更接口 */
export class Grid {
  /** 宿主容器 DOM 节点 */
  private container: HTMLElement
  /** 渲染用 canvas 元素 */
  private canvas: HTMLCanvasElement
  /** canvas 2D 绘图上下文 */
  private ctx: CanvasRenderingContext2D
  /** 当前数据源 */
  private data: DataSource
  /** 当前主题 */
  private theme: Theme
  /** 用户通过 options 显式传入的行高（优先于主题值） */
  private explicitDefaultRowHeight: number | undefined
  /** 行轴（管理每行的高度与位置映射） */
  private rowsAxis: ChunkedAxis
  /** 列轴（管理每列的宽度与位置映射） */
  private colsAxis: ChunkedAxis
  /** 冻结区域配置 */
  private frozen: FrozenRegions
  /** 视口状态（尺寸、滚动偏移、快照） */
  private viewport: Viewport
  /** 高 DPI 适配器 */
  private highDpi: HighDPI
  /** 帧渲染器 */
  private renderer: Renderer
  /** 是否已销毁，防止重复操作 */
  private destroyed = false
  /** 构造时保存容器的原始 position 值，销毁时恢复 */
  private originalPosition: string

  constructor(container: HTMLElement, options: GridOptions) {
    this.container = container
    this.data = options.data
    this.theme = options.theme ?? denseGridTheme
    this.explicitDefaultRowHeight = options.defaultRowHeight

    this.canvas = document.createElement('canvas')
    Object.assign(this.canvas.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      pointerEvents: 'none',
    })
    const computedPos = getComputedStyle(this.container).position
    this.originalPosition = this.container.style.position
    if (computedPos === 'static') {
      this.container.style.position = 'relative'
    }
    this.container.appendChild(this.canvas)

    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('NovaSheet: 2d canvas context unavailable')
    this.ctx = ctx

    const rowHeight = this.resolveDefaultRowHeight()
    this.rowsAxis = new ChunkedAxis({ count: this.data.getRowCount(), defaultSize: rowHeight })
    this.colsAxis = new ChunkedAxis({
      count: this.data.getSchema().fields.length,
      defaultSize: this.averageColWidth(),
    })
    this.frozen = new FrozenRegions(
      this.rowsAxis,
      this.colsAxis,
      options.frozenRows ?? 0,
      options.frozenCols ?? 0,
    )
    this.viewport = new Viewport(this.rowsAxis, this.colsAxis, this.frozen)
    this.viewport.setHeaderHeight(this.theme.metrics.headerHeight)

    this.highDpi = new HighDPI(this.canvas, this.ctx)
    this.renderer = new Renderer({
      ctx: this.ctx,
      data: this.data,
      viewport: this.viewport,
      rowsAxis: this.rowsAxis,
      colsAxis: this.colsAxis,
      theme: this.theme,
    })

    const rect = this.container.getBoundingClientRect()
    const w = rect.width || 400
    const h = rect.height || 300
    this.highDpi.resize(w, h)
    this.viewport.setSize(w, h)
    this.applyFieldWidths()

    this.renderer.paint()
  }

  /** 替换数据源并重建所有子系统，触发重绘 */
  setData(data: DataSource): void {
    this.data = data
    this.rowsAxis = new ChunkedAxis({
      count: this.data.getRowCount(),
      defaultSize: this.resolveDefaultRowHeight(),
    })
    this.colsAxis = new ChunkedAxis({
      count: this.data.getSchema().fields.length,
      defaultSize: this.averageColWidth(),
    })
    this.frozen = new FrozenRegions(
      this.rowsAxis,
      this.colsAxis,
      this.frozen.frozenRows,
      this.frozen.frozenCols,
    )
    this.viewport = new Viewport(this.rowsAxis, this.colsAxis, this.frozen)
    this.viewport.setHeaderHeight(this.theme.metrics.headerHeight)
    const rect = this.container.getBoundingClientRect()
    this.viewport.setSize(rect.width || 400, rect.height || 300)
    this.applyFieldWidths()
    this.renderer = new Renderer({
      ctx: this.ctx,
      data: this.data,
      viewport: this.viewport,
      rowsAxis: this.rowsAxis,
      colsAxis: this.colsAxis,
      theme: this.theme,
    })
    this.invalidate()
  }

  /** 切换主题并同步更新行高、表头高度及所有 Painter，触发重绘 */
  setTheme(theme: Theme): void {
    this.theme = theme
    this.viewport.setHeaderHeight(theme.metrics.headerHeight)
    if (this.explicitDefaultRowHeight === undefined) {
      this.rowsAxis.setDefaultSize(theme.metrics.rowHeight)
    }
    this.renderer.setTheme(theme)
    this.invalidate()
  }

  /** 设置指定行的高度（px），触发重绘 */
  setRowHeight(rowIndex: number, height: number): void {
    this.rowsAxis.setSize(rowIndex, height)
    this.invalidate()
  }

  /** 通过字段 id 设置列宽（px），触发重绘 */
  setColumnWidth(fieldId: string, width: number): void {
    const fields = this.data.getSchema().fields
    const index = fields.findIndex((f) => f.id === fieldId)
    if (index < 0) return
    this.colsAxis.setSize(index, width)
    this.invalidate()
  }

  /** 手动触发一次重绘（数据源外部发生变更时使用） */
  refresh(): void {
    this.invalidate()
  }

  /** 销毁 Grid：取消待执行的 RAF、移除 canvas、恢复容器 position。幂等。 */
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.renderer.destroy()
    if (this.canvas.parentNode === this.container) {
      this.container.removeChild(this.canvas)
    }
    this.container.style.position = this.originalPosition
  }

  /** 通知渲染器在下一帧重绘（已销毁则忽略） */
  private invalidate(): void {
    if (this.destroyed) return
    this.renderer.invalidate()
  }

  /** 返回实际使用的默认行高：优先 options.defaultRowHeight，退回主题值 */
  private resolveDefaultRowHeight(): number {
    return this.explicitDefaultRowHeight ?? this.theme.metrics.rowHeight
  }

  /** 计算 Schema 各字段宽度的均值，用作 colsAxis 的默认列宽 */
  private averageColWidth(): number {
    const fields = this.data.getSchema().fields
    if (fields.length === 0) return 100
    const sum = fields.reduce((acc, f) => acc + f.width, 0)
    return Math.max(1, Math.round(sum / fields.length))
  }

  /** 将各字段声明的宽度写入 colsAxis（仅非均值字段，避免无谓写入） */
  private applyFieldWidths(): void {
    const fields = this.data.getSchema().fields
    const avg = this.colsAxis.getDefaultSize()
    for (let i = 0; i < fields.length; i++) {
      if (fields[i]!.width !== avg) {
        this.colsAxis.setSize(i, fields[i]!.width)
      }
    }
  }
}
