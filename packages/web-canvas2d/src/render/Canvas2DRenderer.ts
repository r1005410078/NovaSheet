/**
 * Renderer——单帧绘制的总调度（spec §5）。
 *
 * 职责：
 *   - 从 Viewport.snapshot() 取「该绘什么」的不可变快照
 *   - 按 spec §5.3 顺序合成各 painter：清屏 → main 象限（cell + grid lines）→ 冻结象限 → header
 *   - 通过共享 frameScheduler 调度 RAF；同帧多次 invalidate() 合并为一次 flush（key 去重）
 *   - destroy() 时取消 pending RAF，避免组件销毁后还有一次延迟 paint（M1 hardening 修复）
 *
 * 绘制流程示意：
 *
 * ```
 * scroll / resize / setTheme / refresh
 *                 │
 *                 ▼
 *        Renderer.invalidate()
 *                 │ schedule("renderer:flush")
 *                 ▼
 *          FrameScheduler
 *                 │ requestAnimationFrame
 *                 ▼
 *           Renderer.paint()
 *                 │
 *                 ├─ 1. Viewport.snapshot()
 *                 │     └─ quadrants / scrollX/Y / contentRect
 *                 │
 *                 ├─ 2. clear canvas background
 *                 │
 *                 ├─ 3. DataSource.getRows() 预热可见行
 *                 │
 *                 ├─ 4. paintQuadrant(main)
 *                 │     ├─ DataSource.getCell()
 *                 │     ├─ CellPainter.paint()
 *                 │     └─ GridLinesPainter.paint()
 *                 │
 *                 └─ 5. HeaderPainter.paint()
 *                       └─ Canvas 2D context
 * ```
 *
 * 当前实现降级：
 *   - 只画 `main` 象限（FrozenRegions 暂只返回 main）；冻结的 3 个象限留 M3
 *   - paintQuadrant 已经按 viewport.scrollX/Y 偏移单元格与网格线；M2 NativeScroller
 *     接入后由它驱动 viewport.setScroll
 *   - 不做局部脏区——全帧整片重绘（spec §5.2，预算 < 5ms 内绰绰有余）
 *
 * `getRows` 同步路径返回数组立即可用，Promise 返回值在 M1 直接忽略（M2+ 异步源会
 * 通过 DataSource.subscribe 发 rowsChanged 触发重绘）。
 */

import type { DataSource, Quadrant, RenderFrame, Theme } from '@novasheet/core'
import { FrameScheduler, type Axis, type Viewport } from '@novasheet/core'
import { CellPainter } from '../painters/CellPainter'
import { GridLinesPainter } from '../painters/GridLinesPainter'
import { HeaderPainter } from '../painters/HeaderPainter'

/** Canvas2DRenderer 构造选项 */
export interface Canvas2DRendererOptions {
  /** canvas 2D 绘图上下文 */
  ctx: CanvasRenderingContext2D
  /** 数据源 */
  data: DataSource
  /** 视口状态 */
  viewport: Viewport
  /** 行轴 */
  rowsAxis: Axis
  /** 列轴 */
  colsAxis: Axis
  /** 当前主题 */
  theme: Theme
  /** 共享同一个 scheduler，让 scroll / resize / render 合并到同一帧 RAF（见 CLAUDE.md 不变量 5） */
  scheduler?: FrameScheduler
}

/** scheduler key——每个 Renderer 实例同一时间最多一个待执行 flush */
const RENDERER_KEY = 'renderer:flush'

/**
 * 拥有每帧绘制管线。除 painter 实例外，Renderer 本身基本无状态：
 * 每次 paint() 都从 Viewport.snapshot() 取最新快照（spec §4 单一数据源），
 * 通过 DataSource 取数（由 DataSource 自行决定同步/异步），把像素绘制委托给三个 painter。
 *
 * M1 只画 `main` 象限（无滚动、无冻结）。管线骨架已为 M2/M3 留好——
 * paint() 入口与 Viewport 契约都不需要变。
 */
export class Canvas2DRenderer {
  /** canvas 2D 绘图上下文 */
  private ctx: CanvasRenderingContext2D
  /** 当前数据源 */
  private data: DataSource
  /** 视口状态 */
  private viewport: Viewport
  /** 行轴 */
  private rowsAxis: Axis
  /** 列轴 */
  private colsAxis: Axis
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

  /**
   * 组装单帧绘制管线。
   *
   * Renderer 的实现思路是“薄调度器 + 专用 painter”：
   *   - Renderer 持有会随外部变化的输入：DataSource、Viewport、行/列轴、Theme。
   *   - 每次 paint() 开始时只从 Viewport.snapshot() 读一份不可变快照，决定本帧可见范围。
   *   - 具体像素绘制拆给 CellPainter / GridLinesPainter / HeaderPainter，Renderer 只负责顺序。
   *   - invalidate() 不直接绘制，而是通过 FrameScheduler 合并到下一帧 RAF。
   *
   * 这里不复制数据、不缓存可见单元格，也不直接做 DOM 操作；Grid 负责生命周期和 DOM，
   * Renderer 只负责“给定当前状态，画出这一帧”。
   */
  constructor(opts: Canvas2DRendererOptions) {
    // Canvas 2D context 是所有 painter 最终写入的目标。
    // HighDPI 已经在 Grid 中配置好 transform，所以这里继续使用 CSS px 坐标。
    this.ctx = opts.ctx

    // DataSource 提供 schema、可见行预热和 getCell 热路径读取。
    // Renderer 不拥有数据，只在 paint() 中按当前可见范围读取。
    this.data = opts.data

    // Viewport 是本帧“画什么”的唯一读入口；Renderer 不直接向它写入滚动或尺寸。
    this.viewport = opts.viewport

    // 行列轴用于把 row/col index 映射到 canvas 坐标和单元格尺寸。
    // 它们由 Grid 创建和 mutation，Renderer 只在绘制时读取。
    this.rowsAxis = opts.rowsAxis
    this.colsAxis = opts.colsAxis

    // Theme 是所有视觉值来源，painter 初始化时也拿同一份 theme。
    this.theme = opts.theme

    // 正常路径由 Grid 传入 per-Grid scheduler，让 scroll/read/render 合并在同一 RAF。
    // fallback new FrameScheduler() 只用于直接单测 Renderer 或独立使用时的兜底。
    this.scheduler = opts.scheduler ?? new FrameScheduler()

    // 三个 painter 分别负责不同绘制职责：
    //   - CellPainter：单元格内容、文本截断、类型分派
    //   - GridLinesPainter：批量绘制水平/垂直网格线
    //   - HeaderPainter：顶部列头背景和字段名
    // Renderer 通过固定顺序调用它们，保证层级稳定：cell -> grid lines -> header。
    this.cellPainter = new CellPainter(this.theme)
    this.gridLinesPainter = new GridLinesPainter(this.theme)
    this.headerPainter = new HeaderPainter(this.theme)
  }

  /** 切换主题并同步 Painter；重绘由 `WebGridRuntime` 调度 `render(frame)`。 */
  setTheme(theme: Theme): void {
    this.theme = theme
    this.cellPainter.setTheme(theme)
    this.gridLinesPainter.setTheme(theme)
    this.headerPainter.setTheme(theme)
  }

  /** 替换数据源；重绘由 runtime 负责。 */
  setData(data: DataSource): void {
    this.data = data
  }

  /**
   * 请求下一帧绘制。一帧内多次调用会通过 scheduler 的 key 去重合并为单次绘制。
   * 任何控制流（scroll 处理、data 事件、theme 切换、容器 resize）都可以安全调用。
   */
  invalidate(): void {
    this.scheduler.schedule(RENDERER_KEY, () => this.paint())
  }

  /** 取消已入队但未执行的 flush。被 Grid.destroy() 调用——见 CLAUDE.md destroy 不变量。 */
  destroy(): void {
    this.scheduler.cancel(RENDERER_KEY)
  }

  /** `WebRenderer` 过渡 stub：canvas 由 `Canvas2DBackend` 创建，尚未迁到 mount。 */
  mount(container: HTMLElement): void {
    void container
  }

  /** `WebRenderer` 过渡 stub：位图缩放由 `HighDPI` + `onSurfaceResize` 处理。 */
  resize(width: number, height: number, dpr: number): void {
    void width
    void height
    void dpr
  }

  /** `WebRenderer` 入口：只读 `RenderFrame`（spec 不变量 #1）。 */
  render(frame: RenderFrame): void {
    this.syncFromFrame(frame)
    this.paintFrame(frame)
  }

  /**
   * 同步绘制一帧（测试 / `invalidate()` 兜底）。
   * 从构造期 `viewport` 合成 frame；生产路径由 `WebGridRuntime` 传 `engine.getFrame()`。
   */
  paint(): void {
    this.render({
      data: this.data,
      theme: this.theme,
      rowsAxis: this.rowsAxis,
      colsAxis: this.colsAxis,
      viewport: this.viewport.snapshot(),
    })
  }

  /** 将 frame 中的可变输入同步到实例，便于 `setTheme` patch 与 `paint()` 兜底一致。 */
  private syncFromFrame(frame: RenderFrame): void {
    this.data = frame.data
    if (frame.theme !== this.theme) {
      this.setTheme(frame.theme)
    } else {
      this.theme = frame.theme
    }
    this.rowsAxis = frame.rowsAxis
    this.colsAxis = frame.colsAxis
  }

  private paintFrame(frame: RenderFrame): void {
    const { viewport: snapshot, data, theme, rowsAxis, colsAxis } = frame
    const { contentRect, headerHeight, quadrants, scrollX, scrollY } = snapshot

    // 1) 清屏 + 背景色
    this.ctx.fillStyle = theme.colors.background
    this.ctx.fillRect(0, 0, contentRect.width, contentRect.height)

    // 2) 字体一帧设置一次，painter 内部不再变更——避免重复设置 ctx.font 的开销
    this.ctx.font = `${theme.metrics.fontSize}px ${theme.metrics.fontFamily}`

    // 3) 区间预热：把可见行范围打给 DataSource（同步源直接返回，异步源借此触发 IO）
    const main = quadrants.main
    if (main.rowRange[1] >= main.rowRange[0]) {
      const maybe = data.getRows(main.rowRange[0], main.rowRange[1])
      // M1 仅同步源；M2+ 接异步源时这里要加 `if (maybe instanceof Promise) maybe.then(invalidate)`
      void maybe
    }

    // 4) 绘主区——main 象限两轴都跟随滚动
    this.paintQuadrant(main, scrollX, scrollY, data, rowsAxis, colsAxis)

    // 5) 列头（始终在最顶层，M3 加冻结象限后仍最后绘以覆盖滚动列头）。
    this.headerPainter.paint(this.ctx, {
      schema: data.getSchema(),
      colsAxis,
      colRange: main.colRange,
      width: contentRect.width,
      scrollOffsetX: scrollX,
    })

    void headerHeight
  }

  /**
   * 绘制单个象限——main 象限两轴都跟随滚动；M3 的 topLeft / topRight / bottomLeft
   * 分别传 (0, 0) / (scrollX, 0) / (0, scrollY)，逻辑统一。
   *
   * 单元格尺寸用 ChunkedAxis.getSize 而非 indexToPosition 差分——CLAUDE.md 不变量 #7。
   */
  private paintQuadrant(
    quadrant: Quadrant,
    scrollX: number,
    scrollY: number,
    data: DataSource,
    rowsAxis: Axis,
    colsAxis: Axis,
  ): void {
    const { rowRange, colRange, rect } = quadrant
    if (rowRange[1] < rowRange[0] || colRange[1] < colRange[0]) return

    const schema = data.getSchema()
    for (let r = rowRange[0]; r <= rowRange[1]; r++) {
      const yTop = rowsAxis.indexToPosition(r)
      const rowHeight = rowsAxis.getSize(r)
      const cellY = rect.y + yTop - scrollY

      for (let c = colRange[0]; c <= colRange[1]; c++) {
        const field = schema.fields[c]
        if (!field) continue
        const xLeft = colsAxis.indexToPosition(c)
        const colWidth = colsAxis.getSize(c)
        const cellX = rect.x + xLeft - scrollX
        const value = data.getCell(r, field.id)
        this.cellPainter.paint(this.ctx, {
          value,
          rect: { x: cellX, y: cellY, width: colWidth, height: rowHeight },
          field,
        })
      }
    }

    this.gridLinesPainter.paint(this.ctx, {
      rowsAxis,
      colsAxis,
      rowRange,
      colRange,
      rect,
      scrollOffsetX: scrollX,
      scrollOffsetY: scrollY,
    })
  }
}
