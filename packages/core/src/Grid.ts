/**
 * Grid——@novasheet/core 的公共门面（facade）。
 *
 * 职责：
 *   - 把容器 DOM、用户配置组装成完整渲染管线（DataSource + Theme + 两根 ChunkedAxis +
 *     FrozenRegions + Viewport + HighDPI + Renderer）
 *   - 暴露**所有外部可写入口**：setData / setTheme / setRowHeight / setColumnWidth / refresh / destroy。
 *     CLAUDE.md 不变量 #2：所有 mutation 走 Grid，painter / layout 不自我 invalidate。
 *   - 维护 destroy 幂等性（CLAUDE.md 不变量 #6）：取消所有 RAF、恢复 container.style.position、
 *     移除 canvas；mount → destroy → mount 在 React Strict Mode 下不报错。
 *
 * 与子系统的边界：
 *   - 子系统（Renderer / Viewport / ChunkedAxis）对外只接受快照读 + 受控写
 *   - Grid 不参与单帧绘制逻辑——绘制时序由 Renderer 走共享 frameScheduler 决定
 *
 * 当前里程碑：M1 已完成静态单帧渲染；scroll / frozen quadrants / 交互 resize handle 留待 M2-M4。
 * 见 docs/superpowers/specs §3 公共 API 与 §5 渲染管线。
 */

import type { DataSource } from './data/DataSource'
import { ChunkedAxis } from './layout/ChunkedAxis'
import { FrozenRegions } from './layout/FrozenRegions'
import { Viewport } from './layout/Viewport'
import { HighDPI } from './render/HighDPI'
import { Renderer } from './render/Renderer'
import { NativeScroller } from './scroll/NativeScroller'
import { ScrollMapper } from './scroll/ScrollMapper'
import { denseGridTheme } from './theme/denseGridTheme'
import type { Theme } from './theme/Theme'
import { FrameScheduler } from './util/raf'

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
  /** 原生滚动宿主（提供原生滚动条，M2） */
  private scrollHost!: HTMLDivElement
  /** 滚动占位元素（撑出 native scrollbar 的可滚动范围，M2） */
  private scrollSpacer!: HTMLDivElement
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
  /** 滚动映射器（content ↔ scroll-host 非线性映射，M2） */
  private scrollMapper: ScrollMapper
  /** 原生滚动事件适配器（M2） */
  private nativeScroller!: NativeScroller
  /** 容器尺寸变化监听器；happy-dom 中可能不可用 */
  private resizeObserver: ResizeObserver | null = null
  /** 每个 Grid 一个 RAF 调度器，让 scroll / render / resize 合并到同一帧（CLAUDE.md 不变量 #5） */
  private scheduler: FrameScheduler = new FrameScheduler()
  /** 是否已销毁，防止重复操作 */
  private destroyed = false
  /** 构造时保存容器的原始 position 值，销毁时恢复 */
  private originalPosition: string

  constructor(container: HTMLElement, options: GridOptions) {
    this.container = container
    this.data = options.data
    this.theme = options.theme ?? denseGridTheme
    this.explicitDefaultRowHeight = options.defaultRowHeight

    // Position the container so absolute children (canvas, scroll-host) anchor correctly
    const computedPos = getComputedStyle(this.container).position
    this.originalPosition = this.container.style.position
    if (computedPos === 'static') {
      this.container.style.position = 'relative'
    }

    // Scroll-host: native scrollbar provider; absolutely fills container
    this.scrollHost = document.createElement('div')
    this.scrollHost.setAttribute('data-novasheet-scroll-host', '')
    Object.assign(this.scrollHost.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      overflow: 'auto',
    })
    // Spacer: sized to ScrollMapper.computeSpacerSize, gives the scrollbar its range
    this.scrollSpacer = document.createElement('div')
    this.scrollSpacer.setAttribute('data-novasheet-scroll-spacer', '')
    Object.assign(this.scrollSpacer.style, {
      display: 'block',
      width: '0px',
      height: '0px',
    })
    this.scrollHost.appendChild(this.scrollSpacer)
    this.container.appendChild(this.scrollHost)

    // Canvas: sits on top, pointer-events: none so wheel/touch scroll passes through
    this.canvas = document.createElement('canvas')
    Object.assign(this.canvas.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      pointerEvents: 'none',
    })
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
    this.scrollMapper = new ScrollMapper()
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
      scheduler: this.scheduler,
    })

    // happy-dom（以及未挂载的真实 DOM 元素）会把 getBoundingClientRect 全部返 0；
    // 退到默认尺寸保证首帧仍有内容，宿主会在 M2 引入 ResizeObserver 后立即纠正尺寸。
    const rect = this.container.getBoundingClientRect()
    const w = rect.width || 400
    const h = rect.height || 300
    this.highDpi.resize(w, h)
    this.viewport.setSize(w, h)
    this.applyFieldWidths()
    this.resizeSpacer()

    // Wire native scroll → ScrollMapper → Viewport.setScroll → Renderer.invalidate
    this.nativeScroller = new NativeScroller(this.scrollHost, this.scheduler, (scrollTop, scrollLeft) => {
      const { logicalX, logicalY } = this.mapScrollToLogical(scrollTop, scrollLeft)
      this.viewport.setScroll(logicalX, logicalY)
      this.renderer.invalidate()
    })
    this.nativeScroller.attach()

    // Watch container resize so spacer + canvas stay in sync with element size
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this._onContainerResize())
      this.resizeObserver.observe(this.container)
    }

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
    this.resizeSpacer()
    this.renderer = new Renderer({
      ctx: this.ctx,
      data: this.data,
      viewport: this.viewport,
      rowsAxis: this.rowsAxis,
      colsAxis: this.colsAxis,
      theme: this.theme,
      scheduler: this.scheduler,
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
    this.resizeSpacer()
    this.renderer.setTheme(theme)
    this.invalidate()
  }

  /** 覆写单行行高。索引越界静默 no-op。 */
  setRowHeight(rowIndex: number, height: number): void {
    this.rowsAxis.setSize(rowIndex, height)
    this.resizeSpacer()
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
    this.resizeSpacer()
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
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }
    this.nativeScroller.destroy()
    this.renderer.destroy()
    if (this.canvas.parentNode === this.container) {
      this.container.removeChild(this.canvas)
    }
    if (this.scrollHost.parentNode === this.container) {
      this.container.removeChild(this.scrollHost)
    }
    this.container.style.position = this.originalPosition
  }

  /**
   * 滚动到指定行。align：
   *   - 'start' 行顶贴视口顶部
   *   - 'end'   行底贴视口底部
   *   - 'center' 行中心贴视口中心
   * 越界静默 no-op。
   */
  scrollToRow(rowIndex: number, align: 'start' | 'center' | 'end' = 'start'): void {
    if (rowIndex < 0 || rowIndex >= this.rowsAxis.getCount()) return
    const top = this.rowsAxis.indexToPosition(rowIndex)
    const size = this.rowsAxis.getSize(rowIndex)
    const vpH =
      (this.container.clientHeight || this.container.getBoundingClientRect().height || 300) -
      this.theme.metrics.headerHeight
    let logicalY: number
    if (align === 'start') logicalY = top
    else if (align === 'end') logicalY = top + size - vpH
    else logicalY = top + size / 2 - vpH / 2

    const scrollTop = this.logicalToScrollY(logicalY, vpH)
    this.nativeScroller.scrollTo(scrollTop, this.scrollHost.scrollLeft)
  }

  /**
   * 滚动到指定单元格（行索引 + 字段 id）。行 / 字段越界静默 no-op。
   */
  scrollToCell(rowIndex: number, fieldId: string): void {
    const fields = this.data.getSchema().fields
    const colIndex = fields.findIndex((f) => f.id === fieldId)
    if (rowIndex < 0 || rowIndex >= this.rowsAxis.getCount()) return
    if (colIndex < 0) return

    const top = this.rowsAxis.indexToPosition(rowIndex)
    const left = this.colsAxis.indexToPosition(colIndex)
    const vpW = this.container.clientWidth || this.container.getBoundingClientRect().width || 400
    const vpH =
      (this.container.clientHeight || this.container.getBoundingClientRect().height || 300) -
      this.theme.metrics.headerHeight

    const scrollTop = this.logicalToScrollY(top, vpH)
    const scrollLeft = this.logicalToScrollX(left, vpW)
    this.nativeScroller.scrollTo(scrollTop, scrollLeft)
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

  /** Maps DOM scrollTop/scrollLeft to logical scroll coordinates via ScrollMapper. */
  private mapScrollToLogical(scrollTop: number, scrollLeft: number): { logicalX: number; logicalY: number } {
    const contentH = this.rowsAxis.getTotalSize()
    const contentW = this.colsAxis.getTotalSize()
    const spacerH = this.scrollMapper.computeSpacerSize(contentH)
    const spacerW = this.scrollMapper.computeSpacerSize(contentW)
    const vpW = this.container.clientWidth || this.container.getBoundingClientRect().width || 400
    const vpH =
      (this.container.clientHeight || this.container.getBoundingClientRect().height || 300) -
      this.theme.metrics.headerHeight
    return {
      logicalX: this.scrollMapper.scrollToLogical(scrollLeft, spacerW, contentW, vpW),
      logicalY: this.scrollMapper.scrollToLogical(scrollTop, spacerH, contentH, vpH),
    }
  }

  /**
   * 把 logical Y 转成 DOM scrollTop。
   * 当 contentH ≤ viewport（没有可滚动空间）时 ScrollMapper 返回 0；此分支下我们直通
   * 原始 logical 值——真实浏览器会自动 clamp 到 0，测试里 happy-dom 直接读到注入值。
   * 保持 scrollToRow/Cell 的「programmatic 指向意图」可被覆盖测试。
   */
  private logicalToScrollY(logicalY: number, vpH: number): number {
    const contentH = this.rowsAxis.getTotalSize()
    if (contentH <= vpH) return Math.max(0, logicalY)
    const spacerH = this.scrollMapper.computeSpacerSize(contentH)
    return this.scrollMapper.logicalToScroll(logicalY, spacerH, contentH, vpH)
  }

  /** logicalToScrollY 的水平版本。 */
  private logicalToScrollX(logicalX: number, vpW: number): number {
    const contentW = this.colsAxis.getTotalSize()
    if (contentW <= vpW) return Math.max(0, logicalX)
    const spacerW = this.scrollMapper.computeSpacerSize(contentW)
    return this.scrollMapper.logicalToScroll(logicalX, spacerW, contentW, vpW)
  }

  /** Called by ResizeObserver and exposed for tests. */
  private _onContainerResize(): void {
    if (this.destroyed) return
    const w = this.container.clientWidth || this.container.getBoundingClientRect().width || 400
    const h = this.container.clientHeight || this.container.getBoundingClientRect().height || 300
    this.highDpi.resize(w, h)
    this.viewport.setSize(w, h)
    this.invalidate()
  }

  /** Updates scroll-spacer width/height so the native scrollbar reflects current content extent. */
  private resizeSpacer(): void {
    const w = this.scrollMapper.computeSpacerSize(this.colsAxis.getTotalSize())
    const h = this.scrollMapper.computeSpacerSize(this.rowsAxis.getTotalSize())
    this.scrollSpacer.style.width = `${w}px`
    this.scrollSpacer.style.height = `${h}px`
  }
}
