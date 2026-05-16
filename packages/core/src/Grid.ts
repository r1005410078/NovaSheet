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
  /** 缺省 denseGridTheme */
  theme?: Theme
  /** 顶部冻结的行数（M3）；M1 始终为 0 */
  frozenRows?: number
  /** 左侧冻结的列数（M3）；M1 始终为 0 */
  frozenCols?: number
  /**
   * 覆写默认行高。缺省时跟随 `theme.metrics.rowHeight`，后续 `setTheme()` 会同步更新；
   * 显式传值则 sticky——后续 setTheme 不再改它。
   * 见 CLAUDE.md「defaultRowHeight 可选时跟随主题」决策。
   */
  defaultRowHeight?: number
}

/**
 * NovaSheet 渲染引擎的公开门面。持有 canvas、行/列轴布局、viewport、renderer；
 * 宿主应用的所有 mutate 都走这一层，让内部子系统之间保持解耦
 * （CLAUDE.md 不变量 #2：「所有 mutation 走 Grid 门面」）。
 *
 * 生命周期：`new Grid(container, opts)` 在 container 内挂一个 canvas 子节点 + 同步绘首帧，
 * 之后全部走 RAF 调度，直到 `destroy()`。
 * `destroy()` 幂等，并把 container 的 CSS `position` 还原为原值——避免污染宿主页面。
 */
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
      // M2 puppet-scroll 模式：canvas 只负责绘制；M2 加入的 scroll-host 位于其下方接收
      // 滚轮/触控事件。M1 还没有 scroll-host，但提前禁用 pointer-events 保持契约一致。
      pointerEvents: 'none',
    })
    // 如果 container 是 `position: static`，绝对定位的 canvas 会锚到错位的祖先；
    // 仅当需要时提升为 relative，并记录原值以便 destroy() 还原。
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

    // happy-dom（以及未挂载的真实 DOM 元素）会把 getBoundingClientRect 全部返 0；
    // 退到默认尺寸保证首帧仍有内容，宿主会在 M2 引入 ResizeObserver 后立即纠正尺寸。
    const rect = this.container.getBoundingClientRect()
    const w = rect.width || 400
    const h = rect.height || 300
    this.highDpi.resize(w, h)
    this.viewport.setSize(w, h)
    this.applyFieldWidths()

    // 同步首帧——让 new Grid(...) 后立即可见画面；
    // 之后所有 paint 都走 RAF。
    this.renderer.paint()
  }

  /**
   * 切换 DataSource。axis / FrozenRegions / viewport / renderer 都要重建：
   * 字段数、行数、字段宽度都可能变。frozenRows/Cols 与显式 defaultRowHeight 保留。
   */
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

  /**
   * 换主题。只有当用户未在构造期 pin 默认行高时，行高才跟随新主题——
   * 详见 GridOptions.defaultRowHeight。
   */
  setTheme(theme: Theme): void {
    this.theme = theme
    this.viewport.setHeaderHeight(theme.metrics.headerHeight)
    if (this.explicitDefaultRowHeight === undefined) {
      this.rowsAxis.setDefaultSize(theme.metrics.rowHeight)
    }
    this.renderer.setTheme(theme)
    this.invalidate()
  }

  /** 覆写单行行高。索引越界静默 no-op。 */
  setRowHeight(rowIndex: number, height: number): void {
    this.rowsAxis.setSize(rowIndex, height)
    this.invalidate()
  }

  /**
   * 覆写单列列宽（按 fieldId 而非索引，方便 M3 列重排后 API 仍稳定）。
   * 未知 fieldId 静默 no-op。
   */
  setColumnWidth(fieldId: string, width: number): void {
    const fields = this.data.getSchema().fields
    const index = fields.findIndex((f) => f.id === fieldId)
    if (index < 0) return
    this.colsAxis.setSize(index, width)
    this.invalidate()
  }

  /** 强制重绘。外部状态（自定义装饰等）变化时调用。 */
  refresh(): void {
    this.invalidate()
  }

  /**
   * 销毁。Renderer.destroy() 取消挂起的 RAF，移除 canvas DOM 节点，
   * 还原 container 的 position——确保宿主页面回到初始状态。
   * 幂等——可重复调用（对 React Strict Mode 的 mount → unmount → mount 至关重要）。
   */
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.renderer.destroy()
    if (this.canvas.parentNode === this.container) {
      this.container.removeChild(this.canvas)
    }
    this.container.style.position = this.originalPosition
  }

  /** destroy 后到来的 RAF 不应再触发任何绘制——CLAUDE.md destroy 不变量。 */
  private invalidate(): void {
    if (this.destroyed) return
    this.renderer.invalidate()
  }

  /** 返回实际使用的默认行高：优先 options.defaultRowHeight，退回主题值 */
  private resolveDefaultRowHeight(): number {
    return this.explicitDefaultRowHeight ?? this.theme.metrics.rowHeight
  }

  /**
   * 选一个能让 applyFieldWidths() 物化最少 chunk 的 defaultSize。
   * Airtable 风格 schema 里多数字段宽度相近，这样列轴 ChunkedAxis 大概率维持默认状态。
   */
  private averageColWidth(): number {
    const fields = this.data.getSchema().fields
    if (fields.length === 0) return 100
    const sum = fields.reduce((acc, f) => acc + f.width, 0)
    return Math.max(1, Math.round(sum / fields.length))
  }

  /**
   * 把 schema 里 per-field 的 width 物化到列轴。
   * 仅对宽度 !== axis 默认值的字段调 setSize——宽度统一时整个列轴维持 O(1) 快路径。
   */
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
