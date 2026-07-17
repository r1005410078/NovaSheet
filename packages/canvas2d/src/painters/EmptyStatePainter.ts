/**
 * EmptyStatePainter——无数据时在正文区绘制插画与提示文案。
 */

import type { Theme } from '@zhiguang/novasheet-core'
import { paintSvgPath } from '../paint/svg-path'

export interface EmptyStatePaintParams {
  /** 正文区（表头以下） */
  rect: { x: number; y: number; width: number; height: number }
}

export class EmptyStatePainter {
  constructor(private theme: Theme) {}

  setTheme(theme: Theme): void {
    this.theme = theme
  }

  paint(ctx: CanvasRenderingContext2D, params: EmptyStatePaintParams): void {
    const { rect } = params
    if (rect.width < 80 || rect.height < 80) return

    const es = this.theme.emptyState
    const viewBox = { width: es.viewBoxWidth, height: es.viewBoxHeight }
    const scale = Math.min(Math.min(rect.width * 0.36, 88) / viewBox.width, 1)
    const illusW = viewBox.width * scale
    const illusH = viewBox.height * scale
    const textBlockH = this.theme.metrics.fontSize * 2 + 20
    const blockHeight = illusH + textBlockH
    const centerX = rect.x + rect.width / 2
    const centerY = rect.y + rect.height / 2
    const illusX = centerX - illusW / 2
    const illusY = centerY - blockHeight / 2
    const box = { x: illusX, y: illusY, width: illusW, height: illusH }

    for (const layer of es.layers) {
      paintSvgPath(ctx, layer.path, viewBox, box, {
        fill: layer.fill,
        stroke: layer.stroke,
        lineWidth: layer.lineWidth,
        lineCap: layer.lineCap,
      })
    }

    const titleY = illusY + illusH + 18
    const { metrics } = this.theme
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.font = `600 ${metrics.fontSize + 1}px ${metrics.fontFamily}`
    ctx.fillStyle = es.titleColor
    ctx.fillText(es.title, centerX, titleY)
    ctx.font = `${metrics.fontSize}px ${metrics.fontFamily}`
    ctx.fillStyle = es.subtitleColor
    ctx.fillText(es.subtitle, centerX, titleY + metrics.fontSize + 8)
    ctx.restore()
  }
}
