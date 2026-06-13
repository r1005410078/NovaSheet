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
  if (segments.length === 0) return
  const { rect, padX, align, measurer } = layout
  const maxWidth = rect.width - padX * 2
  if (maxWidth <= 0) return

  const first = segments[0]!
  if (first.text.length === 0) return

  const lineWidth = measure(ctx, first.text, first, measurer)
  const startX = lineStartX(rect, padX, align, lineWidth)
  const centerY = rect.y + rect.height / 2

  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.font = first.font
  ctx.fillStyle = first.color
  ctx.fillText(first.text, startX, centerY)
}
