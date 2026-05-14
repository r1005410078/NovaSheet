export class HighDPI {
  private dpr = 1

  constructor(
    private canvas: HTMLCanvasElement,
    private ctx: CanvasRenderingContext2D,
  ) {}

  resize(cssWidth: number, cssHeight: number): void {
    this.dpr = window.devicePixelRatio || 1
    this.canvas.style.width = `${cssWidth}px`
    this.canvas.style.height = `${cssHeight}px`
    this.canvas.width = Math.round(cssWidth * this.dpr)
    this.canvas.height = Math.round(cssHeight * this.dpr)
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
  }

  getDpr(): number {
    return this.dpr
  }
}
