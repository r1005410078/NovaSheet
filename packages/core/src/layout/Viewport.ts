import type { ChunkedAxis } from './ChunkedAxis'
import type { FrozenRegions, Quadrants } from './FrozenRegions'

/** 视口快照：单帧内 Renderer 读取的唯一不可变数据源 */
export interface ViewportSnapshot {
  /** 各象限的行列范围与画布矩形 */
  quadrants: Quadrants
  /** 整个内容区域的 CSS 像素尺寸 */
  contentRect: { width: number; height: number }
  /** 表头高度（px） */
  headerHeight: number
  /** 水平滚动偏移（px） */
  scrollX: number
  /** 垂直滚动偏移（px） */
  scrollY: number
  /** 综合版本号（取 viewport、rowsAxis、colsAxis 三者最大值） */
  version: number
}

/** 视口状态管理：持有尺寸、滚动偏移，并按需生成单帧快照供 Renderer 消费 */
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

  /** 生成当前帧的不可变快照，版本号取三者最大值以捕获任意维度的变更 */
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
