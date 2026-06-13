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

interface LinePiece {
  readonly text: string
  readonly seg: StyledSegment
}
interface LineLayout {
  readonly pieces: readonly LinePiece[]
  readonly height: number // px = 行内最大 fontSize × lineHeightMultiplier
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
  const { rect, padX, padY, lineHeightMultiplier } = layout
  const maxWidth = rect.width - padX * 2
  if (maxWidth <= 0) return

  // 全局最大 fontSize 决定统一行高（混排时所有行等高）
  let globalMaxFontSize = 0
  for (const s of segments) globalMaxFontSize = Math.max(globalMaxFontSize, s.fontSize)
  const uniformLineHeight = (globalMaxFontSize > 0 ? globalMaxFontSize : 1) * lineHeightMultiplier

  const lines = buildLinesBySplit(segments, lineHeightMultiplier, uniformLineHeight)
  if (lines.length === 0) return

  const availableHeight = rect.height - padY * 2
  if (availableHeight <= 0) return

  // 单行：垂直居中（保持 Task 2/3 行为）。多行：自顶向下堆叠，超高裁掉。
  if (lines.length === 1) {
    drawLine(ctx, lines[0]!, layout, rect.y + rect.height / 2)
    return
  }

  let y = rect.y + padY
  for (const line of lines) {
    if (y + line.height > rect.y + padY + availableHeight + 0.01) break
    drawLine(ctx, line, layout, y + line.height / 2)
    y += line.height
  }
}

function buildLinesBySplit(
  segments: readonly StyledSegment[],
  lineHeightMultiplier: number,
  uniformLineHeight?: number,
): LineLayout[] {
  const rawLines: LinePiece[][] = [[]]
  for (const seg of segments) {
    const parts = seg.text.split('\n')
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) rawLines.push([])
      const part = parts[i]!
      if (part.length > 0) rawLines[rawLines.length - 1]!.push({ text: part, seg })
    }
  }
  return rawLines.map((pieces) => ({
    pieces,
    height: uniformLineHeight ?? lineHeight(pieces, lineHeightMultiplier),
  }))
}

function lineHeight(pieces: readonly LinePiece[], multiplier: number): number {
  let maxSize = 0
  for (const p of pieces) maxSize = Math.max(maxSize, p.seg.fontSize)
  return (maxSize > 0 ? maxSize : 1) * multiplier
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  line: LineLayout,
  layout: StyledTextLayout,
  centerY: number,
): void {
  const pieces = line.pieces
  if (pieces.length === 0) return
  const { rect, padX, align, measurer } = layout
  const widths = pieces.map((p) => measure(ctx, p.text, p.seg, measurer))
  const lineWidth = widths.reduce((a, b) => a + b, 0)
  const startX = lineStartX(rect, padX, align, lineWidth)

  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'

  let x = startX
  for (let i = 0; i < pieces.length; i++) {
    const { text, seg } = pieces[i]!
    ctx.font = seg.font
    ctx.fillStyle = seg.color
    ctx.fillText(text, x, centerY)
    if (seg.underline || seg.strikethrough) {
      drawDecoration(ctx, seg, x, x + widths[i]!, centerY, layout.themeText)
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
