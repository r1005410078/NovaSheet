/**
 * Renderer——单帧绘制的总调度（spec §5）。
 *
 * 职责：
 *   - 从 Viewport.snapshot() 取「该绘什么」的不可变快照
 *   - 按 spec §5.3 顺序合成各 painter：清屏 → main 象限（cell + grid lines）→ 冻结象限 → header
 *   - 通过共享 frameScheduler 调度 RAF；同帧多次 invalidate() 合并为一次 flush（key 去重）
 *   - destroy() 时取消 pending RAF，避免组件销毁后还有一次延迟 paint（M1 hardening 修复）
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

  /**
   * 同步绘制一帧。直接调用会绕开 RAF 调度——仅用于 Grid 构造期的首帧同步绘制
   * 以及测试。生产路径走 invalidate() → scheduler → paint()。
   */
  paint(): void {
    const snapshot = this.viewport.snapshot()
    const { contentRect, headerHeight, quadrants, scrollX, scrollY } = snapshot

    // 1) 清屏 + 背景色
    this.ctx.fillStyle = this.theme.colors.background
    this.ctx.fillRect(0, 0, contentRect.width, contentRect.height)

    // 2) 字体一帧设置一次，painter 内部不再变更——避免重复设置 ctx.font 的开销
    this.ctx.font = `${this.theme.metrics.fontSize}px ${this.theme.metrics.fontFamily}`

    // 3) 区间预热：把可见行范围打给 DataSource（同步源直接返回，异步源借此触发 IO）
    const main = quadrants.main
    if (main.rowRange[1] >= main.rowRange[0]) {
      const maybe = this.data.getRows(main.rowRange[0], main.rowRange[1])
      // M1 仅同步源；M2+ 接异步源时这里要加 `if (maybe instanceof Promise) maybe.then(invalidate)`
      void maybe
    }

    // 4) 绘主区——main 象限两轴都跟随滚动
    this.paintQuadrant(main, scrollX, scrollY)

    // 5) 列头（始终在最顶层，M3 加冻结象限后仍最后绘以覆盖滚动列头）。
    //    跟随主区横向滚动 scrollX——否则横向滚后字段名被画到 viewport 左侧外。
    this.headerPainter.paint(this.ctx, {
      schema: this.data.getSchema(),
      colsAxis: this.colsAxis,
      colRange: main.colRange,
      width: contentRect.width,
      scrollOffsetX: scrollX,
    })

    // 备注：M1 不画冻结象限（FrozenRegions stub 只返回 main）。
    // M3 会把 paint() 扩展为遍历 quadrants 中所有非空象限。
    void headerHeight
  }

  /**
   * 绘制单个象限——main 象限两轴都跟随滚动；M3 的 topLeft / topRight / bottomLeft
   * 分别传 (0, 0) / (scrollX, 0) / (0, scrollY)，逻辑统一。
   *
   * 单元格尺寸用 ChunkedAxis.getSize 而非 indexToPosition 差分——CLAUDE.md 不变量 #7。
   */
  private paintQuadrant(quadrant: Quadrant, scrollX: number, scrollY: number): void {
    const { rowRange, colRange, rect } = quadrant
    if (rowRange[1] < rowRange[0] || colRange[1] < colRange[0]) return

    const schema = this.data.getSchema()
    for (let r = rowRange[0]; r <= rowRange[1]; r++) {
      const yTop = this.rowsAxis.indexToPosition(r)
      const rowHeight = this.rowsAxis.getSize(r)
      const cellY = rect.y + yTop - scrollY

      for (let c = colRange[0]; c <= colRange[1]; c++) {
        const field = schema.fields[c]
        if (!field) continue
        const xLeft = this.colsAxis.indexToPosition(c)
        const colWidth = this.colsAxis.getSize(c)
        const cellX = rect.x + xLeft - scrollX
        // 异步 DataSource 范围未加载时 getCell 返回 undefined；CellPainter 直接 noop
        // （未来 M2+ 加占位骨架时改为绘灰色占位条）
        const value = this.data.getCell(r, field.id)
        this.cellPainter.paint(this.ctx, {
          value,
          rect: { x: cellX, y: cellY, width: colWidth, height: rowHeight },
          field,
        })
      }
    }

    // 网格线最后绘——覆盖在单元格之上（与 Excel / Numbers 一致）。
    // GridLinesPainter 内部把所有线合并到一次 stroke 调用，避免重复 strokeStyle/beginPath。
    this.gridLinesPainter.paint(this.ctx, {
      rowsAxis: this.rowsAxis,
      colsAxis: this.colsAxis,
      rowRange,
      colRange,
      rect,
      scrollOffsetX: scrollX,
      scrollOffsetY: scrollY,
    })
  }
}
