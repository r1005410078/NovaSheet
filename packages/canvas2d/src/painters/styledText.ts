import type { QuadrantRect, TextMeasurer, TextWrapMode, ThemeText } from '@novasheet/core'

export interface StyledSegment {
  readonly text: string
  readonly font: string
  readonly fontSize: number
  readonly color: string
  readonly underline?: boolean
  readonly strikethrough?: boolean
}

export interface StyledTextLayout {
  readonly rect: QuadrantRect
  readonly padX: number
  readonly padY: number
  readonly align: CanvasTextAlign
  readonly wrap: TextWrapMode
  readonly lineHeightMultiplier: number
  readonly themeText: ThemeText
  readonly measurer?: TextMeasurer
}

function measure(
  ctx: CanvasRenderingContext2D,
  text: string,
  seg: StyledSegment,
  measurer: TextMeasurer | undefined,
): number {
  if (measurer) return measurer.measureWidth(text, seg.font)
  ctx.font = seg.font
  return ctx.measureText(text).width
}

function lineStartX(rect: QuadrantRect, padX: number, align: CanvasTextAlign, lineWidth: number): number {
  switch (align) {
    case 'right':
      return rect.x + rect.width - padX - lineWidth
    case 'center':
      return rect.x + rect.width / 2 - lineWidth / 2
    default:
      return rect.x + padX
  }
}

export function paintStyledText(
  ctx: CanvasRenderingContext2D,
  segments: readonly StyledSegment[],
  layout: StyledTextLayout,
): void {
  const drawable = segments.filter((s) => s.text.length > 0)
  if (drawable.length === 0) return
  const { rect, padX, align, measurer } = layout
  const maxWidth = rect.width - padX * 2
  if (maxWidth <= 0) return

  const widths = drawable.map((s) => measure(ctx, s.text, s, measurer))
  const lineWidth = widths.reduce((a, b) => a + b, 0)
  const startX = lineStartX(rect, padX, align, lineWidth)
  const centerY = rect.y + rect.height / 2

  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'

  let x = startX
  for (let i = 0; i < drawable.length; i++) {
    const s = drawable[i]!
    ctx.font = s.font
    ctx.fillStyle = s.color
    ctx.fillText(s.text, x, centerY)
    if (s.underline || s.strikethrough) {
      drawDecoration(ctx, s, x, x + widths[i]!, centerY, layout.themeText)
    }
    x += widths[i]!
  }
}

function drawDecoration(
  ctx: CanvasRenderingContext2D,
  seg: StyledSegment,
  x0: number,
  x1: number,
  centerY: number,
  themeText: ThemeText,
): void {
  ctx.strokeStyle = seg.color
  if (seg.underline) {
    ctx.lineWidth = themeText.underlineWidth
    const y = centerY + themeText.underlineOffset
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(x1, y)
    ctx.stroke()
  }
  if (seg.strikethrough) {
    ctx.lineWidth = themeText.lineThroughWidth
    const y = centerY - themeText.lineThroughOffset
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(x1, y)
    ctx.stroke()
  }
}
