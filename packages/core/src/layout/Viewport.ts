import type { ChunkedAxis } from './ChunkedAxis'
import type { FrozenRegions, Quadrants } from './FrozenRegions'

export interface ViewportSnapshot {
  quadrants: Quadrants
  contentRect: { width: number; height: number }
  headerHeight: number
  scrollX: number
  scrollY: number
  version: number
}

export class Viewport {
  private width = 0
  private height = 0
  private scrollX = 0
  private scrollY = 0
  private headerHeight = 0
  private _version = 0

  constructor(
    private rowsAxis: ChunkedAxis,
    private colsAxis: ChunkedAxis,
    private frozen: FrozenRegions,
  ) {}

  setSize(width: number, height: number): void {
    this.width = width
    this.height = height
    this._version++
  }

  setScroll(scrollX: number, scrollY: number): void {
    this.scrollX = scrollX
    this.scrollY = scrollY
    this._version++
  }

  setHeaderHeight(h: number): void {
    this.headerHeight = h
    this._version++
  }

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
