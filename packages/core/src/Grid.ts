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
import { ScrollMapper } from '@novasheet/web'
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
 *
 * 首次渲染调用流程：
 *
 * ```
 * new Grid(container, options)
 *          │
 *          ├─ 1. 保存 data / theme / defaultRowHeight
 *          │
 *          ├─ 2. 创建 DOM 层
 *          │      ├─ scrollHost   原生滚动容器
 *          │      ├─ scrollSpacer 撑出滚动条范围
 *          │      └─ canvas       实际绘制表格
 *          │
 *          ├─ 3. 创建布局与状态层
 *          │      ├─ rowsAxis / colsAxis
 *          │      ├─ FrozenRegions
 *          │      ├─ ScrollMapper
 *          │      └─ Viewport
 *          │
 *          ├─ 4. 创建渲染层
 *          │      ├─ HighDPI.resize(width, height)
 *          │      └─ Renderer(...)
 *          │
 *          ├─ 5. 接通滚动和 resize
 *          │      ├─ NativeScroller.attach()
 *          │      └─ ResizeObserver.observe(container)
 *          │
 *          └─ 6. renderer.paint()
 *                 └─ 同步首帧：constructor 返回时 canvas 已经有画面
 * ```
 *
 * 滚动后的渲染调用流程：
 *
 * ```
 * 用户滚动 scrollHost
 *          │
 *          ▼
 * NativeScroller
 *          │ schedule("scroll:read")
 *          ▼
 * FrameScheduler / requestAnimationFrame
 *          │
 *          ▼
 * 读取 scrollTop / scrollLeft
 *          │
 *          ▼
 * Grid.mapScrollToLogical()
 *          │ DOM scroll 坐标 -> 逻辑内容坐标 logicalX / logicalY
 *          ▼
 * Viewport.setScroll(logicalX, logicalY)
 *          │
 *          ▼
 * Renderer.invalidate()
 *          │ schedule("renderer:flush")
 *          ▼
 * FrameScheduler / requestAnimationFrame
 *          │
 *          ▼
 * Renderer.paint()
 *          │
 *          ├─ Viewport.snapshot()
 *          ├─ DataSource.getRows() / getCell()
 *          ├─ CellPainter / GridLinesPainter / HeaderPainter
 *          └─ Canvas 2D
 * ```
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

  /**
   * 创建一个 Grid 实例，并立即在传入容器中挂载 scroll-host + canvas，完成首帧同步绘制。
   *
   * @example
   * ```ts
   * import { Grid, InMemoryDataSource } from '@novasheet/core'
   *
   * const container = document.getElementById('sheet')!
   * const data = new InMemoryDataSource({
   *   schema: {
   *     fields: [
   *       { id: 'name', name: 'Name', type: 'text', width: 180 },
   *       { id: 'age', name: 'Age', type: 'number', width: 80 },
   *     ],
   *   },
   *   rows: [
   *     { name: 'Ada Lovelace', age: 36 },
   *     { name: 'Grace Hopper', age: 85 },
   *   ],
   * })
   *
   * const grid = new Grid(container, { data })
   * grid.scrollToRow(1)
   * grid.destroy()
   * ```
   *
   * @example
   * ```ts
   * const grid = new Grid(container, {
   *   data,
   *   theme: denseGridTheme,
   *   defaultRowHeight: 40, // sticky: later setTheme() will not override row height
   * })
   * ```
   */
  constructor(container: HTMLElement, options: GridOptions) {
    // 1) 保存宿主传入的最小配置。
    //
    // Grid 是整个 core 的 facade：外部只把 DOM 容器、DataSource 和可选 Theme 交给它。
    // 这里先把这些“外部事实”落到实例字段，后续所有子系统都从这些字段派生。
    this.container = container
    this.data = options.data
    this.theme = options.theme ?? denseGridTheme
    // defaultRowHeight 一旦由用户显式传入，就视为 sticky 配置。
    // 后续 setTheme() 不会再用新主题的 rowHeight 覆盖它；否则默认行高跟随主题。
    this.explicitDefaultRowHeight = options.defaultRowHeight

    // 2) 准备宿主容器的定位上下文。
    //
    // Grid 会在 container 内挂两个 absolute 子节点：
    //   - scrollHost：提供浏览器原生滚动条
    //   - canvas：负责实际绘制

    const computedPos = getComputedStyle(this.container).position
    this.originalPosition = this.container.style.position
    if (computedPos === 'static') {
      // 如果宿主原本是 static，absolute 子节点会相对更外层定位，所以这里临时改成 relative。
      // container 不能保持 static：scrollHost/canvas 的 top/left/right/bottom 需要以 container
      // 为 containing block，否则可能贴到 body 或其他外层定位祖先上，导致多个 Grid 互相覆盖。
      // originalPosition 必须保存下来，destroy() 时还原，避免污染宿主页面布局。
      this.container.style.position = 'relative'
    }

    // 3) 创建 scroll-host：它不画内容，只负责拿到浏览器原生滚动能力。
    //
    // 设计点：
    //   - absolute + 四边 0：让它完整覆盖 Grid 容器
    //   - overflow: auto：由浏览器绘制滚动条，避免自绘 scrollbar 的复杂兼容问题
    //   - z-index: 1：放在 canvas 上方，确保浏览器滚动条可见
    //   - canvas 会设置 pointer-events: none，所以 wheel/touch 事件能落到 scrollHost
    //
    // M4 计划中的 resize handle layer 会用 z-index: 2，压在 scrollHost 上方接管命中区。
    this.scrollHost = document.createElement('div')
    this.scrollHost.setAttribute('data-novasheet-scroll-host', '')
    Object.assign(this.scrollHost.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      overflow: 'auto',
      zIndex: '1',
    })

    // 4) 创建 scroll-spacer：用一个空 div 撑出滚动范围。
    //
    // 真实内容可能是 1M 行，逻辑高度可达数千万 px；但浏览器元素 scrollHeight 有上限。
    // 所以 spacer 的尺寸不是直接等于真实内容尺寸，而是后面由 resizeSpacer()
    // 通过 ScrollMapper.computeSpacerSize() 计算，并在 SAFE_MAX 内封顶。
    // 用户滚动这个 spacer，Grid 再把 DOM scrollTop 映射成逻辑内容坐标。
    this.scrollSpacer = document.createElement('div')
    this.scrollSpacer.setAttribute('data-novasheet-scroll-spacer', '')
    Object.assign(this.scrollSpacer.style, {
      display: 'block',
      width: '0px',
      height: '0px',
    })
    this.scrollHost.appendChild(this.scrollSpacer)
    this.container.appendChild(this.scrollHost)

    // 5) 创建 canvas：它只负责画当前可见区域。
    //
    // canvas 放在 scrollHost 下方（z-index: 0），scrollHost 放上方（z-index: 1）。
    // pointer-events: none 是关键：canvas 虽然铺满容器，但不会挡住 scrollHost 的滚动事件。
    // 也就是说，视觉内容来自 canvas，滚动交互来自 scrollHost。
    this.canvas = document.createElement('canvas')
    Object.assign(this.canvas.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      pointerEvents: 'none',
      zIndex: '0',
    })
    this.container.appendChild(this.canvas)

    // 6) 获取 2D 绘图上下文。
    //
    // 后续 Renderer / Painter 都共享这个 ctx。没有 2D context 时直接失败，
    // 因为 NovaSheet 当前渲染路径完全基于 Canvas 2D。
    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('NovaSheet: 2d canvas context unavailable')
    this.ctx = ctx

    // 7) 建立两根布局轴：行轴和列轴。
    //
    // rowsAxis：rowIndex -> y position / row height
    // colsAxis：colIndex -> x position / col width
    //
    // 行默认高度来自 options.defaultRowHeight 或 theme.metrics.rowHeight。
    // 列默认宽度取 schema 字段宽度平均值，随后 applyFieldWidths() 只物化偏离平均值的列，
    // 让列宽相近时 ChunkedAxis 保持更少的 override chunk。
    const rowHeight = this.resolveDefaultRowHeight()
    this.rowsAxis = new ChunkedAxis({ count: this.data.getRowCount(), defaultSize: rowHeight })
    this.colsAxis = new ChunkedAxis({
      count: this.data.getSchema().fields.length,
      defaultSize: this.averageColWidth(),
    })

    // 8) 建立冻结区域模型。
    //
    // 当前 FrozenRegions 还只是 M3 的接口骨架：即使传入 frozenRows/frozenCols，
    // getQuadrants() 目前仍只返回 main 象限。保留这个对象是为了让 Viewport/Renderer
    // 的契约提前稳定，后续接入 4 象限时不用推翻调用链。
    this.frozen = new FrozenRegions(
      this.rowsAxis,
      this.colsAxis,
      options.frozenRows ?? 0,
      options.frozenCols ?? 0,
    )

    // 9) 建立滚动映射器和 Viewport。
    //
    // ScrollMapper 只负责数学映射：DOM scrollTop/Left <-> 逻辑内容坐标。
    // Viewport 聚合尺寸、滚动位置、header 高度和象限切分，是 Renderer 每帧唯一读源。
    this.scrollMapper = new ScrollMapper()
    this.viewport = new Viewport(this.rowsAxis, this.colsAxis, this.frozen)
    this.viewport.setHeaderHeight(this.theme.metrics.headerHeight)

    // 10) 建立 DPR 适配器和 Renderer。
    //
    // HighDPI 负责把 canvas bitmap 放大到 devicePixelRatio，同时保持 painter 继续用 CSS px。
    // Renderer 拿到 DataSource / Viewport / Axis / Theme / Scheduler 后，就能按 snapshot 绘制一帧。
    // scheduler 是 per-Grid 实例共享的：NativeScroller 和 Renderer 都用它合并到同一 RAF。
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

    // 11) 初始化尺寸、列宽和滚动 spacer。
    //
    // happy-dom（以及未挂载的真实 DOM 元素）会把 getBoundingClientRect 全部返 0；
    // 退到默认尺寸保证首帧仍有内容，宿主会在 M2 引入 ResizeObserver 后立即纠正尺寸。
    const rect = this.container.getBoundingClientRect()
    const w = rect.width || 400
    const h = rect.height || 300
    // canvas 物理尺寸 + CSS 尺寸同步到当前容器尺寸。
    this.highDpi.resize(w, h)
    // Viewport 记录 CSS px 视口尺寸，供 snapshot() 计算可见行列范围。
    this.viewport.setSize(w, h)
    // 将 schema field.width 写入列轴；只有偏离默认宽度的列会被物化。
    this.applyFieldWidths()
    // 根据行列总尺寸重算 spacer，让原生滚动条拥有正确滚动范围。
    this.resizeSpacer()

    // 12) 接通滚动链路：
    //
    // DOM scroll event
    //   -> NativeScroller 在同一帧读取 scrollTop/scrollLeft
    //   -> Grid.mapScrollToLogical() 用 ScrollMapper 转成 logicalX/logicalY
    //   -> Viewport.setScroll() 更新快照输入
    //   -> Renderer.invalidate() 请求下一帧重绘
    this.nativeScroller = new NativeScroller(
      this.scrollHost,
      this.scheduler,
      (scrollTop, scrollLeft) => {
        const { logicalX, logicalY } = this.mapScrollToLogical(scrollTop, scrollLeft)
        this.viewport.setScroll(logicalX, logicalY)
        this.renderer.invalidate()
      },
    )
    this.nativeScroller.attach()

    // 13) 监听容器尺寸变化。
    //
    // 宿主布局变化时，canvas bitmap、Viewport 尺寸、scroll 映射和当前画面都要同步更新。
    // happy-dom / 某些测试环境可能没有 ResizeObserver，所以这里按能力存在性启用。
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this._onContainerResize())
      this.resizeObserver.observe(this.container)
    }

    // 14) 同步绘制首帧。
    //
    // 构造函数结束前直接 paint 一次，保证 `new Grid(container, options)` 返回后
    // 容器里已经有可见画面。后续数据、滚动、resize、主题变化都走 invalidate() + RAF。
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
    this.remapScroll()
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
    this.remapScroll()
    this.renderer.setTheme(theme)
    this.invalidate()
  }

  /** 覆写单行行高。索引越界静默 no-op。 */
  setRowHeight(rowIndex: number, height: number): void {
    this.rowsAxis.setSize(rowIndex, height)
    this.resizeSpacer()
    this.remapScroll()
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
    this.remapScroll()
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
    // align math uses 内容区高度（vpContentH = clientH - headerH），因为 logicalY 的语义是
    // 「content area top 的偏移」（不包括 header）。
    const { clientH } = this.getClientSize()
    const vpContentH = clientH - this.theme.metrics.headerHeight
    let logicalY: number
    if (align === 'start') logicalY = top
    else if (align === 'end') logicalY = top + size - vpContentH
    else logicalY = top + size / 2 - vpContentH / 2

    const scrollTop = this.logicalToScrollY(logicalY)
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
    const scrollTop = this.logicalToScrollY(top)
    const scrollLeft = this.logicalToScrollX(left)
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

  /**
   * 当前容器尺寸（CSS px）。统一走 clientWidth/Height（scroll geometry 的常规来源），
   * 退化为 getBoundingClientRect / 默认值仅是 happy-dom 兜底。
   */
  private getClientSize(): { clientW: number; clientH: number } {
    const clientW =
      this.container.clientWidth || this.container.getBoundingClientRect().width || 400
    const clientH =
      this.container.clientHeight || this.container.getBoundingClientRect().height || 300
    return { clientW, clientH }
  }

  /**
   * 把 DOM scrollTop/scrollLeft 映射成 logical content-area 坐标。
   *
   * 关键：垂直轴 spacer 高度 = `contentH + headerH`（header 占据视口顶部 headerH px，必须
   * 计入 DOM 可滚动总量），mapper 的 viewportSize 传 `clientH`（DOM 视口全高），contentSize
   * 传 `contentH + headerH`。两边对齐后 DOM_maxScroll === mapper_maxLogical，最后一行可达。
   *
   * 水平轴没有 header 等价物，直接用 (contentW, clientW)。
   */
  private mapScrollToLogical(
    scrollTop: number,
    scrollLeft: number,
  ): { logicalX: number; logicalY: number } {
    const headerH = this.theme.metrics.headerHeight
    const contentH = this.rowsAxis.getTotalSize()
    const contentW = this.colsAxis.getTotalSize()
    const spacerH = this.scrollMapper.computeSpacerSize(contentH + headerH)
    const spacerW = this.scrollMapper.computeSpacerSize(contentW)
    const { clientW, clientH } = this.getClientSize()
    return {
      logicalX: this.scrollMapper.scrollToLogical(scrollLeft, spacerW, contentW, clientW),
      logicalY: this.scrollMapper.scrollToLogical(scrollTop, spacerH, contentH + headerH, clientH),
    }
  }

  /**
   * 把 logical Y 转成 DOM scrollTop。content + headerH ≤ clientH 时 ScrollMapper 返回 0
   * （与真实浏览器一致：内容塞得下时 `scrollTo({ top: N })` 会被自动 clamp）。
   */
  private logicalToScrollY(logicalY: number): number {
    const headerH = this.theme.metrics.headerHeight
    const contentH = this.rowsAxis.getTotalSize()
    const spacerH = this.scrollMapper.computeSpacerSize(contentH + headerH)
    const { clientH } = this.getClientSize()
    return this.scrollMapper.logicalToScroll(logicalY, spacerH, contentH + headerH, clientH)
  }

  /** logicalToScrollY 的水平版本（X 轴无 header 偏移）。 */
  private logicalToScrollX(logicalX: number): number {
    const contentW = this.colsAxis.getTotalSize()
    const spacerW = this.scrollMapper.computeSpacerSize(contentW)
    const { clientW } = this.getClientSize()
    return this.scrollMapper.logicalToScroll(logicalX, spacerW, contentW, clientW)
  }

  /**
   * 在 axis 总尺寸 / 容器尺寸变化后重新读 DOM scrollTop 并同步到 viewport——
   * 防止下一帧用过期的 logical 坐标绘制（非线性映射下旧 scrollTop 会被解读到错误位置）。
   */
  private remapScroll(): void {
    const { logicalX, logicalY } = this.mapScrollToLogical(
      this.scrollHost.scrollTop,
      this.scrollHost.scrollLeft,
    )
    this.viewport.setScroll(logicalX, logicalY)
  }

  /** Called by ResizeObserver and exposed for tests. */
  private _onContainerResize(): void {
    if (this.destroyed) return
    const { clientW, clientH } = this.getClientSize()
    this.highDpi.resize(clientW, clientH)
    this.viewport.setSize(clientW, clientH)
    this.remapScroll()
    this.invalidate()
  }

  /**
   * 重算 scroll-spacer 尺寸。
   * 垂直 spacer = `contentH + headerH`：把 header 占据的 headerH 也计入 DOM 可滚动总量，
   * 这样 DOM `scrollTop ∈ [0, spacerH - clientH]` 与 mapper `logicalY ∈ [0, contentH - vpContentH]`
   * 端点对齐，最后一行可被滚到完全可见。水平没有 header 偏移。
   */
  private resizeSpacer(): void {
    const headerH = this.theme.metrics.headerHeight
    const w = this.scrollMapper.computeSpacerSize(this.colsAxis.getTotalSize())
    const h = this.scrollMapper.computeSpacerSize(this.rowsAxis.getTotalSize() + headerH)
    this.scrollSpacer.style.width = `${w}px`
    this.scrollSpacer.style.height = `${h}px`
  }
}
