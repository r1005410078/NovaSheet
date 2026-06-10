/**
 * Renderer——单帧绘制的总调度（spec §5）。
 *
 * 职责：
 *   - 从 Viewport.snapshot() 取「该绘什么」的不可变快照
 *   - 按固定 layer 顺序合成各 painter：background → content → grid → overlay
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
 *                 │     └─ regions / scrollX/Y / contentRect
 *                 │
 *                 ├─ 2. background layer
 *                 │     └─ canvas background / future hover & selection fill
 *                 │
 *                 ├─ 3. content layer
 *                 │     ├─ DataSource.getRows() 预热可见行
 *                 │     ├─ paintCellContentRegion(main / frozen regions)
 *                 │     ├─ DataSource.getCell()
 *                 │     ├─ CellPainter.paint()
 *                 │     ├─ HeaderPainter.paint()
 *                 │     └─ RowHeaderPainter.paint()
 *                 │
 *                 ├─ 4. grid layer
 *                 │     ├─ GridLinesPainter.paint()
 *                 │     ├─ paintFrozenSeparators()
 *                 │     └─ paintOuterFrame()
 *                 │
 *                 └─ 5. overlay layer
 *                       └─ Phase 3 接入 selection / active cell / resize handle
 * ```
 *
 * 当前实现：
 *   - 无冻结时只画 `main`；配置冻结行列后按 region.zIndex 绘制。
 *   - paintCellContentRegion / paintGridLinesRegion 按 region.scrollOffsetX/Y 偏移；
 *     冻结区域自己的
 *     offset 由 FrozenRegions 统一计算。
 *   - 不做局部脏区——全帧整片重绘（spec §5.2，预算 < 5ms 内绰绰有余）
 *
 * `getRows` 同步路径返回数组立即可用，Promise 返回值在 M1 直接忽略（M2+ 异步源会
 * 通过 DataSource.subscribe 发 rowsChanged 触发重绘）。
 */

import type {
  CellValue,
  DataSource,
  Field,
  RenderBackend,
  RenderFrame,
  RenderRegion,
  CellAddress,
  CellRange,
  ResolvedCellFormat,
  Schema,
  TextMeasurer,
  TextWrapMode,
  Theme,
} from '@novasheet/core'
import { FrameScheduler, type Axis, type Viewport } from '@novasheet/core'
import { MergeLookup, mergedRectSize } from '../paint/merge-lookup'
import { buildFilledCellLookup } from '../paint/filled-lookup'
import { CellPainter } from '../painters/CellPainter'
import { EmptyStatePainter } from '../painters/EmptyStatePainter'
import { FormatBorderPainter } from '../painters/FormatBorderPainter'
import { FormatFillPainter } from '../painters/FormatFillPainter'
import { GridLinesPainter, type FilledCellLookup } from '../painters/GridLinesPainter'
import { HeaderPainter } from '../painters/HeaderPainter'
import { RowHeaderPainter } from '../painters/RowHeaderPainter'
import { CANVAS2D_PAINT_LAYERS, type Canvas2DPaintLayer } from './PaintLayer'

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
  /**
   * 文本量度器（M3 autofit）。`field.wrap === true` 的单元格在绘制时调它做行宽度量。
   * 未提供时 wrap 字段静默退化为单行截断。
   */
  measurer?: TextMeasurer
}

/** scheduler key——每个 Renderer 实例同一时间最多一个待执行 flush */
const RENDERER_KEY = 'renderer:flush'

interface Canvas2DPaintFrameContext {
  frame: RenderFrame
  snapshot: RenderFrame['viewport']
  contentRect: { width: number; height: number }
  regions: RenderRegion[]
  paintOrder: RenderRegion[]
  data: DataSource
  theme: Theme
  rowsAxis: Axis
  colsAxis: Axis
  isEmpty: boolean
  excelChrome: boolean
  /** 每帧唯一实例，content 与 grid layer 共用，避免重复构造。 */
  merges: MergeLookup
  /** 每帧唯一实例：有填充背景的单元格查找，grid layer 跳过其网格线。 */
  filledCells: FilledCellLookup
}

/**
 * 拥有每帧绘制管线。除 painter 实例外，Renderer 本身基本无状态：
 * 每次 paint() 都从 Viewport.snapshot() 取最新快照（spec §4 单一数据源），
 * 通过 DataSource 取数（由 DataSource 自行决定同步/异步），再按 Phase 2 的四层管线绘制。
 *
 * 无冻结时只画 `main` 区域；冻结行列开启后同一管线迭代额外区域。
 */
export class Canvas2DRenderer implements RenderBackend {
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
  /** 行号列绘制器（Excel 门面） */
  private rowHeaderPainter: RowHeaderPainter
  /** 无数据插画绘制器 */
  private emptyStatePainter: EmptyStatePainter
  /** 格式填充背景绘制器（Phase 5-A） */
  private formatFillPainter: FormatFillPainter
  /** 自定义边框绘制器（Phase 5-A） */
  private formatBorderPainter: FormatBorderPainter

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

    // painter 分别负责不同绘制职责：
    //   - CellPainter：单元格内容、文本截断、类型分派
    //   - GridLinesPainter：批量绘制水平/垂直网格线
    //   - HeaderPainter：顶部列头背景和字段名
    // Renderer 通过固定 layer 顺序调用它们，保证层级稳定：
    // background -> content -> grid -> overlay。
    this.cellPainter = new CellPainter(this.theme, { measurer: opts.measurer })
    this.gridLinesPainter = new GridLinesPainter(this.theme)
    this.headerPainter = new HeaderPainter(this.theme)
    this.rowHeaderPainter = new RowHeaderPainter(this.theme)
    this.emptyStatePainter = new EmptyStatePainter(this.theme)
    this.formatFillPainter = new FormatFillPainter()
    this.formatBorderPainter = new FormatBorderPainter()
  }

  /** 注入或替换 TextMeasurer。autofit 触发或 backend 切换 measurer 时调用。 */
  setMeasurer(measurer: TextMeasurer): void {
    this.cellPainter.setMeasurer(measurer)
  }

  /** 切换主题并同步 Painter；重绘由 `WebGridRuntime` 调度 `render(frame)`。 */
  setTheme(theme: Theme): void {
    this.theme = theme
    this.cellPainter.setTheme(theme)
    this.gridLinesPainter.setTheme(theme)
    this.headerPainter.setTheme(theme)
    this.rowHeaderPainter.setTheme(theme)
    this.emptyStatePainter.setTheme(theme)
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

  /** `RenderBackend` 过渡 stub：canvas 由 `canvas2dBackend` 工厂创建，尚未迁到 mount。 */
  mount(container: HTMLElement): void {
    void container
  }

  /** `RenderBackend` 过渡 stub：位图缩放由 `HighDPI` + `onSurfaceResize` 处理。 */
  resize(width: number, height: number, dpr: number): void {
    void width
    void height
    void dpr
  }

  /** `RenderBackend` 入口：只读 `RenderFrame`（spec 不变量 #1）。 */
  render(frame: RenderFrame): void {
    this.syncFromFrame(frame)
    this.paintFrame(frame)
  }

  /**
   * 同步绘制一帧（测试 / `invalidate()` 兜底，例如 `setTheme` 触发的重绘）。
   * 从构造期 `viewport` 合成 frame；生产路径由 `WebGridRuntime` 传 `engine.getFrame()`。
   *
   * `cellFormats` / `mergeRegions` 等可选 frame 字段不在此处同步：`syncFromFrame` 只保存
   * 滚动/轴/主题等会随外部调用变化的可变输入；格式与合并的权威来源是 `render(engine.getFrame())`。
   */
  paint(): void {
    this.render({
      data: this.data,
      theme: this.theme,
      rowsAxis: this.rowsAxis,
      colsAxis: this.colsAxis,
      viewport: this.viewport.snapshot(),
      collapsedRowGaps: [],
      collapsedColGaps: [],
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
    const { contentRect, regions } = snapshot
    const merges = new MergeLookup(frame.mergeRegions ?? [])
    const ctx: Canvas2DPaintFrameContext = {
      frame,
      snapshot,
      contentRect,
      regions,
      paintOrder: [...regions].sort((a, b) => a.zIndex - b.zIndex),
      data,
      theme,
      rowsAxis,
      colsAxis,
      isEmpty: data.getRowCount() === 0,
      excelChrome: snapshot.rowHeaderWidth > 0,
      merges,
      filledCells: buildFilledCellLookup(frame.cellFormats ?? [], merges),
    }

    for (const layer of CANVAS2D_PAINT_LAYERS) this.paintLayer(layer, ctx)
  }

  private paintLayer(layer: Canvas2DPaintLayer, ctx: Canvas2DPaintFrameContext): void {
    if (layer === 'background') {
      this.paintBackgroundLayer(ctx)
      return
    }
    if (layer === 'content') {
      this.paintContentLayer(ctx)
      return
    }
    if (layer === 'grid') {
      this.paintGridLayer(ctx)
      return
    }
    this.paintOverlayLayer(ctx)
  }

  private paintBackgroundLayer(ctx: Canvas2DPaintFrameContext): void {
    const { contentRect, theme } = ctx
    this.ctx.fillStyle = theme.colors.background
    this.ctx.fillRect(0, 0, contentRect.width, contentRect.height)
  }

  private paintContentLayer(ctx: Canvas2DPaintFrameContext): void {
    const {
      contentRect,
      data,
      theme,
      rowsAxis,
      colsAxis,
      snapshot,
      regions,
      paintOrder,
      excelChrome,
    } = ctx

    if (ctx.isEmpty) {
      const bodyTop = snapshot.headerHeight
      const bodyHeight = contentRect.height - bodyTop
      const gutter = snapshot.rowHeaderWidth
      if (bodyHeight > 0) {
        this.emptyStatePainter.paint(this.ctx, {
          rect: { x: gutter, y: bodyTop, width: contentRect.width - gutter, height: bodyHeight },
        })
      }
      this.paintHeaders(
        paintOrder,
        data,
        colsAxis,
        excelChrome,
        ctx.frame.viewPipeline,
        ctx.frame.collapsedColGaps,
        this.getSelectedColumnHeaderRange(ctx.frame),
      )
      this.paintRowHeaders(regions, rowsAxis, snapshot, this.getSelectedRowHeaderRange(ctx.frame))
      return
    }

    // 合并查找表由 paintFrame 统一构造（ctx.merges），content 与 grid layer 共用同一实例。
    const { merges } = ctx

    // 格式填充背景：先于文本绘制，确保文字不被遮挡；content layer 最靠后的阶段
    const cellFormats = ctx.frame.cellFormats ?? []
    if (cellFormats.length > 0) {
      for (const region of paintOrder) {
        this.formatFillPainter.paint(this.ctx, {
          rowsAxis,
          colsAxis,
          rect: region.rect,
          rowRange: region.rowRange,
          colRange: region.colRange,
          scrollOffsetX: region.scrollOffsetX,
          scrollOffsetY: region.scrollOffsetY,
          cellFormats,
          merges,
        })
      }
    }

    // 字体一帧设置一次，painter 内部不再变更——避免重复设置 ctx.font 的开销
    this.ctx.font = `${theme.metrics.fontSize}px ${theme.metrics.fontFamily}`
    this.preloadVisibleRows(ctx)
    const textWrapLookup = buildTextWrapLookup(cellFormats)
    for (const region of paintOrder)
      this.paintCellContentRegion(
        region,
        data,
        rowsAxis,
        colsAxis,
        merges,
        textWrapLookup,
        ctx.frame.cellEdit?.cell,
        ctx.frame.formatCell,
      )
    this.paintHeaders(
      paintOrder,
      data,
      colsAxis,
      excelChrome,
      ctx.frame.viewPipeline,
      ctx.frame.collapsedColGaps,
      this.getSelectedColumnHeaderRange(ctx.frame),
    )
    this.paintRowHeaders(regions, rowsAxis, snapshot, this.getSelectedRowHeaderRange(ctx.frame))
  }

  private paintGridLayer(ctx: Canvas2DPaintFrameContext): void {
    const { contentRect, regions, paintOrder, rowsAxis, colsAxis, snapshot, theme } = ctx

    if (!ctx.isEmpty) {
      for (const region of paintOrder)
        this.paintGridLinesRegion(region, rowsAxis, colsAxis, ctx.merges, ctx.filledCells)
      this.paintFrozenSeparators(regions, contentRect, theme, snapshot.scrollX, snapshot.scrollY)

      // 自定义边框：在默认格线之上绘制，确保用户颜色/宽度覆盖默认格线。
      const cellFormats = ctx.frame.cellFormats ?? []
      if (cellFormats.length > 0) {
        for (const region of paintOrder) {
          this.formatBorderPainter.paint(this.ctx, {
            rowsAxis,
            colsAxis,
            rect: region.rect,
            rowRange: region.rowRange,
            colRange: region.colRange,
            scrollOffsetX: region.scrollOffsetX,
            scrollOffsetY: region.scrollOffsetY,
            cellFormats,
            merges: ctx.merges,
          })
        }
      }
    }

    // 视口外框：单元格网格线不覆盖 canvas 右/底边，内容不足一屏时需单独描边。
    this.gridLinesPainter.paintOuterFrame(this.ctx, {
      x: 0,
      y: 0,
      width: contentRect.width,
      height: contentRect.height,
    })
  }

  private paintOverlayLayer(ctx: Canvas2DPaintFrameContext): void {
    const selection = ctx.frame.selection
    if (!selection?.selectedRange) return

    if (ctx.excelChrome) {
      this.paintSelectedColumnHeaders(ctx, selection.selectedRange)
      this.paintSelectedRowHeaders(ctx, selection.selectedRange)
    }
  }

  private paintSelectedColumnHeaders(ctx: Canvas2DPaintFrameContext, range: CellRange): void {
    const { colsAxis, snapshot, theme } = ctx
    const headerHeight = snapshot.headerHeight
    if (headerHeight <= 0) return
    if (this.getSelectedColumnHeaderRange(ctx.frame)) return

    const headerRegions = ctx.paintOrder.filter((region) => region.rowBand === 'middle')
    this.ctx.fillStyle = theme.colors.selectionBg

    for (const region of headerRegions) {
      const startCol = Math.max(range.startCol, region.colRange[0])
      const endCol = Math.min(range.endCol, region.colRange[1])
      if (endCol < startCol) continue

      ctxClipRect(this.ctx, {
        x: region.rect.x,
        y: 0,
        width: region.rect.width,
        height: headerHeight,
      })
      for (let c = startCol; c <= endCol; c++) {
        const x = region.rect.x + colsAxis.indexToPosition(c) - region.scrollOffsetX
        this.ctx.fillRect(x, 0, colsAxis.getSize(c), headerHeight)
      }
      this.ctx.restore()
    }
  }

  private paintSelectedRowHeaders(ctx: Canvas2DPaintFrameContext, range: CellRange): void {
    const { rowsAxis, snapshot, theme } = ctx
    const gutter = snapshot.rowHeaderWidth
    if (gutter <= 0) return
    if (this.getSelectedRowHeaderRange(ctx.frame)) return

    const rowRegions = ctx.paintOrder.filter((region) => region.colBand === 'center')
    this.ctx.fillStyle = theme.colors.selectionBg

    for (const region of rowRegions) {
      const startRow = Math.max(range.startRow, region.rowRange[0])
      const endRow = Math.min(range.endRow, region.rowRange[1])
      if (endRow < startRow) continue

      ctxClipRect(this.ctx, {
        x: 0,
        y: region.rect.y,
        width: gutter,
        height: region.rect.height,
      })
      for (let r = startRow; r <= endRow; r++) {
        const y = region.rect.y + rowsAxis.indexToPosition(r) - region.scrollOffsetY
        this.ctx.fillRect(0, y, gutter, rowsAxis.getSize(r))
      }
      this.ctx.restore()
    }
  }

  private preloadVisibleRows(ctx: Canvas2DPaintFrameContext): void {
    const main = ctx.regions.find((region) => region.id === 'main')!
    if (main.rowRange[1] < main.rowRange[0]) return
    const maybe = ctx.data.getRows(main.rowRange[0], main.rowRange[1])
    // M1 仅同步源；M2+ 接异步源时这里要加 `if (maybe instanceof Promise) maybe.then(invalidate)`
    void maybe
  }

  private paintHeaders(
    paintOrder: RenderRegion[],
    data: DataSource,
    colsAxis: Axis,
    columnLetters: boolean,
    viewPipeline: RenderFrame['viewPipeline'],
    collapsedColGaps: RenderFrame['collapsedColGaps'],
    selectedColumnRange?: Pick<CellRange, 'startCol' | 'endCol'>,
  ): void {
    for (const region of paintOrder.filter((r) => r.rowBand === 'middle')) {
      if (region.colRange[1] < region.colRange[0]) continue
      this.headerPainter.paint(this.ctx, {
        schema: data.getSchema(),
        colsAxis,
        colRange: region.colRange,
        x: region.rect.x,
        width: region.rect.width,
        scrollOffsetX: region.scrollOffsetX,
        columnLetters,
        viewPipeline,
        collapsedColGaps,
        selectedColumnRange,
      })
    }
  }

  private getSelectedColumnHeaderRange(
    frame: RenderFrame,
  ): Pick<CellRange, 'startCol' | 'endCol'> | undefined {
    const range = frame.selection?.selectedRange
    if (!range) return undefined
    const rowCount = frame.data.getRowCount()
    if (rowCount <= 0 || range.startRow !== 0 || range.endRow !== rowCount - 1) return undefined
    return { startCol: range.startCol, endCol: range.endCol }
  }

  private getSelectedRowHeaderRange(
    frame: RenderFrame,
  ): Pick<CellRange, 'startRow' | 'endRow'> | undefined {
    const range = frame.selection?.selectedRange
    if (!range) return undefined
    const colCount = frame.data.getSchema().fields.length
    if (colCount <= 0 || range.startCol !== 0 || range.endCol !== colCount - 1) return undefined
    return { startRow: range.startRow, endRow: range.endRow }
  }

  private paintRowHeaders(
    regions: RenderRegion[],
    rowsAxis: Axis,
    snapshot: RenderFrame['viewport'],
    selectedRowRange?: Pick<CellRange, 'startRow' | 'endRow'>,
  ): void {
    const gutter = snapshot.rowHeaderWidth
    if (gutter <= 0) return

    this.rowHeaderPainter.paintCorner(this.ctx, gutter)

    const topRegion = regions.find((r) => r.id === 'topCenter')
    if (topRegion && topRegion.rowRange[1] >= topRegion.rowRange[0]) {
      this.rowHeaderPainter.paint(this.ctx, {
        rowsAxis,
        rowRange: topRegion.rowRange,
        rect: { x: 0, y: topRegion.rect.y, width: gutter, height: topRegion.rect.height },
        scrollOffsetY: topRegion.scrollOffsetY,
        selectedRowRange,
      })
    }

    const main = regions.find((r) => r.id === 'main')
    if (main && main.rowRange[1] >= main.rowRange[0]) {
      this.rowHeaderPainter.paint(this.ctx, {
        rowsAxis,
        rowRange: main.rowRange,
        rect: { x: 0, y: main.rect.y, width: gutter, height: main.rect.height },
        scrollOffsetY: main.scrollOffsetY,
        selectedRowRange,
      })
    }
  }

  /**
   * 绘制单个区域。main 两轴都跟随滚动；冻结区域通过 region.scrollOffsetX/Y
   * 表达“哪个方向不滚”，Renderer 不再猜冻结尺寸。
   *
   * 单元格尺寸用 ChunkedAxis.getSize 而非 indexToPosition 差分——CLAUDE.md 不变量 #7。
   */
  private paintCellContentRegion(
    region: RenderRegion,
    data: DataSource,
    rowsAxis: Axis,
    colsAxis: Axis,
    merges: MergeLookup,
    textWrapLookup: Map<string, TextWrapMode>,
    editingCell?: CellAddress,
    formatCell?: (rowIndex: number, colIndex: number, field: Field, value: CellValue) => string | undefined,
  ): void {
    const { rowRange, colRange, rect, scrollOffsetX, scrollOffsetY } = region
    if (rowRange[1] < rowRange[0] || colRange[1] < colRange[0]) return

    ctxClipRect(this.ctx, rect)

    const schema = data.getSchema()
    for (let r = rowRange[0]; r <= rowRange[1]; r++) {
      const yTop = rowsAxis.indexToPosition(r)
      const rowHeight = rowsAxis.getSize(r)
      const cellY = rect.y + yTop - scrollOffsetY

      for (let c = colRange[0]; c <= colRange[1]; c++) {
        if (editingCell && editingCell.rowIndex === r && editingCell.colIndex === c) continue
        const field = schema.fields[c]
        if (!field) continue

        // 合并区域整体在独立 anchor pass 绘制（含 anchor 滚出可见范围的情形），这里全部跳过。
        if (merges.regionAt(r, c)) continue

        const xLeft = colsAxis.indexToPosition(c)
        const cellX = rect.x + xLeft - scrollOffsetX
        const colWidth = colsAxis.getSize(c)
        const value = data.getCell(r, field.id)
        const mode = textWrapLookup.get(`${r}:${c}`) ?? (field.wrap === true ? 'wrap' : 'overflow')
        // overflow：单行文本超出本格且右邻格为空时，把绘制矩形向右扩到第一个非空格/可见列边界，
        // 让文字溢出显示（与 Excel/Sheets 一致）。number 不溢出。
        let paintWidth = colWidth
        if (
          mode === 'overflow' &&
          field.type === 'text' &&
          typeof value === 'string' &&
          value.length > 0 &&
          !value.includes('\n')
        ) {
          paintWidth += this.overflowExtra(r, c, value, colWidth, colRange, schema, data, merges, colsAxis)
        }
        this.cellPainter.paint(this.ctx, {
          value,
          rect: { x: cellX, y: cellY, width: paintWidth, height: rowHeight },
          field,
          textWrap: mode,
          rowIndex: r,
          colIndex: c,
          formatCell,
        })
      }
    }

    this.paintMergeAnchors(region, data, rowsAxis, colsAxis, merges, textWrapLookup, editingCell, formatCell)

    this.ctx.restore()
  }

  /**
   * overflow 模式下，文本超出本格可用宽度时，沿右侧扫描连续空格（非空/合并/列边界即停），
   * 返回可溢出的额外宽度（px）。`ctx.measureText` 已用一帧统一字体，量度准确。
   */
  private overflowExtra(
    r: number,
    c: number,
    text: string,
    colWidth: number,
    colRange: readonly [number, number],
    schema: Schema,
    data: DataSource,
    merges: MergeLookup,
    colsAxis: Axis,
  ): number {
    const padX = this.theme.metrics.cellPaddingX
    if (this.ctx.measureText(text).width <= colWidth - padX * 2) return 0
    let extra = 0
    for (let nc = c + 1; nc <= colRange[1]; nc++) {
      const nf = schema.fields[nc]
      if (!nf || merges.regionAt(r, nc)) break
      const nv = data.getCell(r, nf.id)
      if (nv !== null && nv !== undefined && String(nv).length > 0) break
      extra += colsAxis.getSize(nc)
    }
    return extra
  }

  /**
   * 合并区域 anchor 绘制 pass（content layer）。
   *
   * 与单格循环分离：anchor 可能在可见 row/col 范围之外（向上/左滚出），单格循环不会访问它，
   * 但区域仍与可见区相交、内容应跨入可见区。这里按区域 anchor 的计算位置绘制一次合并矩形；
   * 负坐标由外层 clip 处理。仅绘制与本 region 可见范围相交的合并区域。
   */
  private paintMergeAnchors(
    region: RenderRegion,
    data: DataSource,
    rowsAxis: Axis,
    colsAxis: Axis,
    merges: MergeLookup,
    textWrapLookup: Map<string, TextWrapMode>,
    editingCell?: CellAddress,
    formatCell?: (rowIndex: number, colIndex: number, field: Field, value: CellValue) => string | undefined,
  ): void {
    if (merges.isEmpty) return
    const { rowRange, colRange, rect, scrollOffsetX, scrollOffsetY } = region
    const schema = data.getSchema()

    for (const merge of merges.regions) {
      const { range } = merge
      // 仅处理与本 region 可见 row/col 范围相交的合并区域。
      if (range.endRow < rowRange[0] || range.startRow > rowRange[1]) continue
      if (range.endCol < colRange[0] || range.startCol > colRange[1]) continue

      const { rowIndex: ar, colIndex: ac } = merge.anchor
      if (editingCell && editingCell.rowIndex === ar && editingCell.colIndex === ac) continue
      const field = schema.fields[ac]
      if (!field) continue

      const cellX = rect.x + colsAxis.indexToPosition(ac) - scrollOffsetX
      const cellY = rect.y + rowsAxis.indexToPosition(ar) - scrollOffsetY
      const { width, height } = mergedRectSize(range, rowsAxis, colsAxis)
      const value = data.getCell(ar, field.id)
      this.cellPainter.paint(this.ctx, {
        value,
        rect: { x: cellX, y: cellY, width, height },
        field,
        textWrap: textWrapLookup.get(`${ar}:${ac}`),
        rowIndex: ar,
        colIndex: ac,
        formatCell,
      })
    }
  }

  private paintGridLinesRegion(
    region: RenderRegion,
    rowsAxis: Axis,
    colsAxis: Axis,
    merges: MergeLookup,
    filledCells: FilledCellLookup,
  ): void {
    const { rowRange, colRange, rect, scrollOffsetX, scrollOffsetY } = region
    if (rowRange[1] < rowRange[0] || colRange[1] < colRange[0]) return

    this.gridLinesPainter.paint(this.ctx, {
      rowsAxis,
      colsAxis,
      rowRange,
      colRange,
      rect,
      scrollOffsetX,
      scrollOffsetY,
      merges,
      filledCells,
    })
  }

  /**
   * 绘制冻结边界分隔线。
   *
   * 普通网格线已经在每个 region 内绘制，但冻结区会裁剪滚动内容；边界需要稳定存在，
   * 否则滚动后强线突然出现会很生硬。未滚过冻结边界时画淡线，滚过后同一条线变强。
   */
  private paintFrozenSeparators(
    regions: RenderRegion[],
    contentRect: { width: number; height: number },
    theme: Theme,
    scrollX: number,
    scrollY: number,
  ): void {
    const idleVerticalLines = new Set<number>()
    const idleHorizontalLines = new Set<number>()
    const activeVerticalLines = new Set<number>()
    const activeHorizontalLines = new Set<number>()
    const hasHorizontalOverflowPastFrozen = scrollX > 0
    const hasVerticalOverflowPastFrozen = scrollY > 0

    for (const region of regions) {
      if (region.id === 'middleLeft') {
        const lineX = region.rect.x + region.rect.width - 0.5
        if (hasHorizontalOverflowPastFrozen) activeVerticalLines.add(lineX)
        else idleVerticalLines.add(lineX)
      }
      if (region.id === 'middleRight') {
        const lineX = region.rect.x - 0.5
        if (hasHorizontalOverflowPastFrozen) activeVerticalLines.add(lineX)
        else idleVerticalLines.add(lineX)
      }
      if (region.rowBand === 'top') {
        const lineY = region.rect.y + region.rect.height - 0.5
        if (hasVerticalOverflowPastFrozen) activeHorizontalLines.add(lineY)
        else idleHorizontalLines.add(lineY)
      }
    }

    this.strokeFrozenSeparatorLines(
      idleVerticalLines,
      idleHorizontalLines,
      contentRect,
      theme.colors.gridLine,
      theme,
    )
    this.strokeFrozenSeparatorLines(
      activeVerticalLines,
      activeHorizontalLines,
      contentRect,
      theme.frozenSeparator.color,
      theme,
    )
  }

  private strokeFrozenSeparatorLines(
    verticalLines: Set<number>,
    horizontalLines: Set<number>,
    contentRect: { width: number; height: number },
    color: string,
    theme: Theme,
  ): void {
    if (verticalLines.size === 0 && horizontalLines.size === 0) return

    this.ctx.save()
    this.ctx.strokeStyle = color
    this.ctx.lineWidth = theme.frozenSeparator.width
    this.ctx.beginPath()

    for (const x of verticalLines) {
      this.ctx.moveTo(x, 0)
      this.ctx.lineTo(x, contentRect.height)
    }
    for (const y of horizontalLines) {
      this.ctx.moveTo(0, y)
      this.ctx.lineTo(contentRect.width, y)
    }

    this.ctx.stroke()
    this.ctx.restore()
  }
}

function ctxClipRect(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
): void {
  ctx.save()
  ctx.beginPath()
  ctx.rect(rect.x, rect.y, rect.width, rect.height)
  ctx.clip()
}

/** 把可见 cellFormats（VIEW 坐标）中设了 textWrap 的格收成 `"row:col" → mode` 查表。 */
function buildTextWrapLookup(
  cellFormats: readonly ResolvedCellFormat[],
): Map<string, TextWrapMode> {
  const lookup = new Map<string, TextWrapMode>()
  for (const cf of cellFormats) {
    if (cf.format.textWrap !== undefined) {
      lookup.set(`${cf.rowIndex}:${cf.colIndex}`, cf.format.textWrap)
    }
  }
  return lookup
}
