/** 在 canvas 上绘制 SVG path（等比缩放到目标矩形内，不拉伸变形）。 */
export function paintSvgPath(
  ctx: CanvasRenderingContext2D,
  pathData: string,
  viewBox: { width: number; height: number },
  dest: { x: number; y: number; width: number; height: number },
  style: { fill?: string; stroke?: string; lineWidth?: number; lineCap?: CanvasLineCap },
): void {
  const scale = Math.min(dest.width / viewBox.width, dest.height / viewBox.height)
  const drawnW = viewBox.width * scale
  const drawnH = viewBox.height * scale
  const offsetX = dest.x + (dest.width - drawnW) / 2
  const offsetY = dest.y + (dest.height - drawnH) / 2

  ctx.save()
  ctx.translate(offsetX, offsetY)
  ctx.scale(scale, scale)
  const path = new Path2D(pathData)
  if (style.fill) {
    ctx.fillStyle = style.fill
    ctx.fill(path)
  }
  if (style.stroke) {
    ctx.strokeStyle = style.stroke
    ctx.lineWidth = (style.lineWidth ?? 1.5) / scale
    if (style.lineCap) ctx.lineCap = style.lineCap
    ctx.stroke(path)
  }
  ctx.restore()
}
