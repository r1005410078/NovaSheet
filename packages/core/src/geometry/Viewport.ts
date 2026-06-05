/**
 * Viewport——聚合 ChunkedAxis（行列轴）+ FrozenRegions（区域切分）+ 当前 scroll 状态，
 * 对外提供 `snapshot()`，是 Renderer **唯一**允许读取的数据源（CLAUDE.md 不变量 #1）。
 *
 * 它用来解决的问题：
 *   - Grid 会从多个来源收到变化：容器 resize、原生滚动、主题 header 高度变化、行列尺寸变化。
 *   - Renderer 如果直接到处读这些可变对象，绘制一帧时可能读到前后不一致的状态。
 *   - Viewport 把这些“本帧要画什么”的输入收拢起来，在 paint() 开始时产出一份快照。
 *
 * 换句话说，Viewport 是 Renderer 的“单帧绘制状态包”：
 *
 * ```
 * Grid 写入：size / scroll / headerHeight
 * Axis 提供：row/col size version
 * FrozenRegions 提供：regions
 *
 * Renderer 读取：Viewport.snapshot()
 * ```
 *
 * 工作方式示意：
 *
 * ```
 *        setSize(width, height)
 * Grid ─ setScroll(scrollX, scrollY) ─┐
 *        setHeaderHeight(headerH)     │
 *                                    ▼
 *                             ┌────────────┐
 * rowsAxis / colsAxis ───────▶│  Viewport  │
 * FrozenRegions ─────────────▶│            │
 *                             └─────┬──────┘
 *                                   │ snapshot()
 *                                   ▼
 *                         ┌───────────────────┐
 *                         │ ViewportSnapshot  │
 *                         │ - contentRect     │
 *                         │ - scrollX/Y       │
 *                         │ - regions         │
 *                         │ - version         │
 *                         └─────────┬─────────┘
 *                                   ▼
 *                                Renderer
 * ```
 *
 * 不变量：
 *   - Renderer 永远从 snapshot 取数，不直接访问 axis / frozen / dataSource
 *   - 每次状态变更（setSize / setScroll / setHeaderHeight）`_version` 自增；snapshot.version
 *     取 max(_version, rowsAxis.version, colsAxis.version)，下游可基于此做脏判
 *   - M1 scroll 始终为 0；M2 NativeScroller 通过 setScroll 注入逻辑滚动位置
 */

import type { ChunkedAxis } from './ChunkedAxis'
import type { FrozenRegions, RenderRegion } from './FrozenRegions'

/**
 * 视口快照：单帧内 Renderer 读取的唯一不可变数据源。
 *
 * @example
 * ```ts
 * const snapshot = viewport.snapshot()
 *
 * snapshot.contentRect // canvas 当前 CSS 尺寸，例如 { width: 800, height: 600 }
 * snapshot.scrollY // 当前内容滚动到哪里，例如 560
 * snapshot.regions[0]?.rowRange // 当前可见行，例如 [20, 40]
 * snapshot.regions[0]?.colRange // 当前可见列，例如 [2, 8]
 * ```
 */
export interface ViewportSnapshot {
  /** 可绘制区域数组；支持 left/center/right 冻结列 */
  regions: RenderRegion[]
  /** canvas 当前 CSS 尺寸 */
  contentRect: { width: number; height: number }
  /** 表头高度（px） */
  headerHeight: number
  /** 行号列宽（px） */
  rowHeaderWidth: number
  /** 水平滚动偏移（px） */
  scrollX: number
  /** 垂直滚动偏移（px） */
  scrollY: number
  /** Viewport 与两个 axis 的最大 version——作为 Renderer 的脏标判定 */
  version: number
}

/**
 * Viewport 聚合「画什么」的输入：尺寸、滚动位置、header 高度、冻结配置（通过 FrozenRegions）。
 * Renderer 每帧只调 snapshot()——这是 spec §4「single read source per frame」的实现：
 * 渲染过程中 Renderer 永远不直接读 axis / FrozenRegions，避免并发 mutate 造成视觉撕裂。
 *
 * @example
 * ```ts
 * const viewport = new Viewport(rowsAxis, colsAxis, frozenRegions)
 *
 * viewport.setSize(800, 600)
 * viewport.setHeaderHeight(32)
 * viewport.setScroll(240, 560)
 *
 * const snapshot = viewport.snapshot()
 * // Renderer 后续只使用 snapshot，不再直接读 viewport 内部字段。
 * ```
 */
export class Viewport {
  /** 视口宽度（CSS px） */
  private width = 0
  /** 视口高度（CSS px） */
  private height = 0
  /** 水平滚动偏移（px） */
  private scrollX = 0
  /** 垂直滚动偏移（px） */
  private scrollY = 0
  /** 表头高度（px），由主题驱动 */
  private headerHeight = 0
  /** 行号列宽（px）；Excel 门面启用时 > 0 */
  private rowHeaderWidth = 0
  /** 视口自身的变更版本号 */
  private _version = 0

  /**
   * 创建一个绘制状态聚合器。
   *
   * @example
   * ```ts
   * const rowsAxis = new ChunkedAxis({ count: 1_000, defaultSize: 28 })
   * const colsAxis = new ChunkedAxis({ count: 20, defaultSize: 120 })
   * const frozen = new FrozenRegions(rowsAxis, colsAxis, {})
   * const viewport = new Viewport(rowsAxis, colsAxis, frozen)
   * ```
   */
  constructor(
    private rowsAxis: ChunkedAxis,
    private colsAxis: ChunkedAxis,
    private frozen: FrozenRegions,
  ) {}

  /**
   * 更新视口尺寸并递增版本号。
   *
   * @example
   * ```ts
   * viewport.setSize(800, 600)
   * viewport.snapshot().contentRect // { width: 800, height: 600 }
   * ```
   */
  setSize(width: number, height: number): void {
    this.width = width
    this.height = height
    this._version++
  }

  /**
   * 更新滚动偏移并递增版本号（M2 NativeScroller 调用此方法）。
   *
   * @example
   * ```ts
   * // 内容向左滚了 240px，向上滚了 560px。
   * viewport.setScroll(240, 560)
   * const snapshot = viewport.snapshot()
   * snapshot.scrollX // 240
   * snapshot.scrollY // 560
   * ```
   */
  setScroll(scrollX: number, scrollY: number): void {
    this.scrollX = scrollX
    this.scrollY = scrollY
    this._version++
  }

  /**
   * 更新表头高度并递增版本号。
   *
   * @example
   * ```ts
   * viewport.setHeaderHeight(32)
   * viewport.snapshot().headerHeight // 32
   * ```
   */
  setHeaderHeight(h: number): void {
    this.headerHeight = h
    this._version++
  }

  setRowHeaderWidth(width: number): void {
    this.rowHeaderWidth = Math.max(0, width)
    this._version++
  }

  /**
   * 不可变快照。每帧绘制开始时调用一次；FrozenRegions 内部根据 viewport 状态实时切分绘制区域。
   * version 取 viewport 自身 + 两个 axis 的最大值——
   * 这样 axis 的 setSize / setDefaultSize 也会反映到 Renderer 的 invalidate 缓存键。
   *
   * @example
   * ```ts
   * viewport.setSize(800, 600)
   * viewport.setHeaderHeight(32)
   * viewport.setScroll(240, 560)
   *
   * const snapshot = viewport.snapshot()
   * snapshot.regions.find((r) => r.id === 'main')?.rect // { x: 0, y: 32, width: 800, height: 568 }
   * snapshot.version // viewport / rowsAxis / colsAxis 三者里的最大版本号
   * ```
   */
  snapshot(): ViewportSnapshot {
    const rect = {
      width: this.width,
      height: this.height,
      scrollX: this.scrollX,
      scrollY: this.scrollY,
      headerHeight: this.headerHeight,
      rowHeaderWidth: this.rowHeaderWidth,
    }
    const regions = this.frozen.getRegions(rect)
    return {
      regions,
      contentRect: { width: this.width, height: this.height },
      headerHeight: this.headerHeight,
      rowHeaderWidth: this.rowHeaderWidth,
      scrollX: this.scrollX,
      scrollY: this.scrollY,
      version: Math.max(this._version, this.rowsAxis.version, this.colsAxis.version),
    }
  }
}
