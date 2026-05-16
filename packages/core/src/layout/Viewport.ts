import type { ChunkedAxis } from './ChunkedAxis'
import type { FrozenRegions, Quadrants } from './FrozenRegions'

/** 视口快照：单帧内 Renderer 读取的唯一不可变数据源 */
export interface ViewportSnapshot {
  /** 4 个象限的绘制范围（M1 只有 main） */
  quadrants: Quadrants
  /** canvas 当前 CSS 尺寸 */
  contentRect: { width: number; height: number }
  /** 表头高度（px） */
  headerHeight: number
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
  /** 视口自身的变更版本号 */
  private _version = 0

  constructor(
    private rowsAxis: ChunkedAxis,
    private colsAxis: ChunkedAxis,
    private frozen: FrozenRegions,
  ) {}

  /** 更新视口尺寸并递增版本号 */
  setSize(width: number, height: number): void {
    this.width = width
    this.height = height
    this._version++
  }

  /** 更新滚动偏移并递增版本号（M2 NativeScroller 调用此方法） */
  setScroll(scrollX: number, scrollY: number): void {
    this.scrollX = scrollX
    this.scrollY = scrollY
    this._version++
  }

  /** 更新表头高度并递增版本号 */
  setHeaderHeight(h: number): void {
    this.headerHeight = h
    this._version++
  }

  /**
   * 不可变快照。每帧绘制开始时调用一次；FrozenRegions 内部根据 viewport 状态实时切分象限。
   * version 取 viewport 自身 + 两个 axis 的最大值——
   * 这样 axis 的 setSize / setDefaultSize 也会反映到 Renderer 的 invalidate 缓存键。
   */
  snapshot(): ViewportSnapshot {
    const quadrants = this.frozen.getQuadrants({
      width: this.width,
      height: this.height,
      scrollX: this.scrollX,
      scrollY: this.scrollY,
      headerHeight: this.headerHeight,
    })
    return {
      quadrants,
      contentRect: { width: this.width, height: this.height },
      headerHeight: this.headerHeight,
      scrollX: this.scrollX,
      scrollY: this.scrollY,
      version: Math.max(this._version, this.rowsAxis.version, this.colsAxis.version),
    }
  }
}
