/** 高 DPI 适配器：根据 devicePixelRatio 缩放 canvas 物理像素并设置 transform，保证显示清晰 */
export class HighDPI {
  /** 当前设备像素比 */
  private dpr = 1

  constructor(
    private canvas: HTMLCanvasElement,
    private ctx: CanvasRenderingContext2D,
  ) {}

  /** 调整 canvas 物理尺寸并同步 CSS 尺寸，重置 transform 以匹配 DPR */
  resize(cssWidth: number, cssHeight: number): void {
    this.dpr = window.devicePixelRatio || 1
    this.canvas.style.width = `${cssWidth}px`
    this.canvas.style.height = `${cssHeight}px`
    this.canvas.width = Math.round(cssWidth * this.dpr)
    this.canvas.height = Math.round(cssHeight * this.dpr)
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
  }

  /** 返回最近一次 resize 时读取的 devicePixelRatio */
  getDpr(): number {
    return this.dpr
  }
}
