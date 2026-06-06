/**
 * 处理 canvas 在高 DPR 屏（Retina 等）下的清晰度。
 * 套路：CSS 尺寸保持逻辑像素，bitmap 尺寸放大 dpr 倍，再用 setTransform(dpr) 让所有
 * 后续绘制按 CSS 像素坐标书写。painter 不必知道 dpr。
 *
 * DPR 1 / 1.5 / 2 / 3 都需要支持（spec §1 成功标准）。
 * M2+ 拖窗到不同显示器会触发 DPR 变更——届时再加 matchMedia 监听调用 resize()。
 */
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
    // CSS 尺寸保持逻辑像素，确保布局不缩放。
    this.canvas.style.width = `${cssWidth}px`
    this.canvas.style.height = `${cssHeight}px`
    // bitmap 尺寸放大 dpr 倍——这是实际渲染像素。
    // round 防止 1.5x DPR 时出现 0.5 像素的非整数尺寸（部分浏览器对此尺寸不友好）。
    this.canvas.width = Math.round(cssWidth * this.dpr)
    this.canvas.height = Math.round(cssHeight * this.dpr)
    // 重置 transform 矩阵：a=d=dpr 表示后续所有 (x,y) 都被自动 ×dpr，
    // 这样 painter 仍按 CSS 像素思考，输出的 bitmap 像素准确。
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
  }

  /** 返回最近一次 resize 时读取的 devicePixelRatio */
  getDpr(): number {
    return this.dpr
  }
}
