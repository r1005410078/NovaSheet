import type { ChunkedAxis } from './ChunkedAxis'

export interface QuadrantRect {
  /** Canvas-space rect in CSS pixels */
  x: number
  y: number
  width: number
  height: number
}

export interface Quadrant {
  rowRange: [number, number]
  colRange: [number, number]
  rect: QuadrantRect
}

export interface Quadrants {
  main: Quadrant
  topLeft?: Quadrant
  topRight?: Quadrant
  bottomLeft?: Quadrant
}

export interface ViewportRect {
  width: number
  height: number
  scrollX: number
  scrollY: number
  headerHeight: number
}

export class FrozenRegions {
  constructor(
    private rowsAxis: ChunkedAxis,
    private colsAxis: ChunkedAxis,
    public frozenRows: number,
    public frozenCols: number,
  ) {}

  setFrozen(rows: number, cols: number): void {
    this.frozenRows = rows
    this.frozenCols = cols
  }

  /**
   * M1: only the `main` quadrant is populated. M3 will add topLeft / topRight / bottomLeft
   * when frozenRows > 0 or frozenCols > 0.
   */
  getQuadrants(vp: ViewportRect): Quadrants {
    // Viewport rect is half-open [start, end); subtract 1 from the end so the
    // boundary pixel at exactly the next column/row start doesn't include it.
    const yStart = vp.scrollY
    const yEnd = vp.scrollY + (vp.height - vp.headerHeight) - 1
    const xStart = vp.scrollX
    const xEnd = vp.scrollX + vp.width - 1

    const rowRange = this.rowsAxis.getVisibleRange(yStart, yEnd)
    const colRange = this.colsAxis.getVisibleRange(xStart, xEnd)

    const main: Quadrant = {
      rowRange,
      colRange,
      rect: {
        x: 0,
        y: vp.headerHeight,
        width: vp.width,
        height: vp.height - vp.headerHeight,
      },
    }
    return { main }
  }
}
