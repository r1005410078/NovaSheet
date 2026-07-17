import { tokenize } from '@zhiguang/core'
import type { QuadrantRect, TextMeasurer, TextWrapMode, ThemeText } from '@zhiguang/core'

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

  const availableHeight = rect.height - padY * 2
  if (availableHeight <= 0) return
  const maxLines = Math.max(1, Math.floor(availableHeight / uniformLineHeight))

  const lines =
    layout.wrap === 'wrap' && layout.measurer
      ? buildLinesByWrap(segments, maxWidth, lineHeightMultiplier, uniformLineHeight, layout.measurer, maxLines)
      : buildLinesBySplit(segments, lineHeightMultiplier, uniformLineHeight)
  if (lines.length === 0) return

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

function buildLinesByWrap(
  segments: readonly StyledSegment[],
  maxWidth: number,
  _multiplier: number,
  uniformLineHeight: number,
  measurer: TextMeasurer,
  maxLines: number,
): LineLayout[] {
  const lines: LinePiece[][] = [[]]
  let curWidth = 0

  const pushNewLine = () => {
    lines.push([])
    curWidth = 0
  }
  const appendPiece = (text: string, s: StyledSegment, w: number) => {
    lines[lines.length - 1]!.push({ text, seg: s })
    curWidth += w
  }

  for (const seg of segments) {
    const parts = seg.text.split('\n')
    for (let pi = 0; pi < parts.length; pi++) {
      if (pi > 0) pushNewLine()
      for (const token of tokenize(parts[pi]!)) {
        const w = measurer.measureWidth(token, seg.font)
        if (curWidth === 0 && w > maxWidth) {
          // 超宽 token：字符级硬切
          for (const ch of token) {
            const cw = measurer.measureWidth(ch, seg.font)
            if (curWidth + cw > maxWidth && curWidth > 0) pushNewLine()
            appendPiece(ch, seg, cw)
          }
        } else if (curWidth + w <= maxWidth || curWidth === 0) {
          appendPiece(token, seg, w)
        } else {
          pushNewLine()
          appendPiece(token, seg, w)
        }
      }
    }
  }

  // 合并同行同段 pieces（如连续 token 来自同一 StyledSegment，合并为单个 piece），再 trimEnd
  const coalesced: LineLayout[] = lines.map((pieces) => {
    const merged = mergeSameSegPieces(pieces)
    const trimmedPieces = trimEndPieces(merged)
    return { pieces: trimmedPieces, height: uniformLineHeight }
  })

  if (coalesced.length > maxLines) {
    const truncated = coalesced.slice(0, maxLines)
    const last = truncated[maxLines - 1]
    if (last) truncated[maxLines - 1] = appendEllipsis(last, maxWidth, measurer)
    return truncated
  }
  return coalesced
}

function mergeSameSegPieces(pieces: LinePiece[]): LinePiece[] {
  if (pieces.length === 0) return pieces
  const result: LinePiece[] = []
  for (const p of pieces) {
    const last = result[result.length - 1]
    if (last && last.seg === p.seg) {
      result[result.length - 1] = { text: last.text + p.text, seg: last.seg }
    } else {
      result.push(p)
    }
  }
  return result
}

function trimEndPieces(pieces: LinePiece[]): LinePiece[] {
  if (pieces.length === 0) return pieces
  const result = pieces.map((p) => ({ ...p }))
  // 从末尾开始 trimEnd
  for (let i = result.length - 1; i >= 0; i--) {
    const p = result[i]!
    const trimmed = p.text.trimEnd()
    if (trimmed !== p.text) {
      result[i] = { text: trimmed, seg: p.seg }
      if (trimmed.length > 0) break
    } else {
      break
    }
  }
  return result
}

function appendEllipsis(line: LineLayout, maxWidth: number, measurer: TextMeasurer): LineLayout {
  const pieces = line.pieces.map((p) => ({ ...p }))
  if (pieces.length === 0) return line
  const ell = '…'
  const prefixWidth = (idx: number) =>
    pieces.slice(0, idx).reduce((a, p) => a + measurer.measureWidth(p.text, p.seg.font), 0)

  // 从末尾 piece 开始砍字符，直到能放下省略号
  for (let i = pieces.length - 1; i >= 0; i--) {
    const p = pieces[i]!
    let text = p.text
    const pw = prefixWidth(i)
    while (pw + measurer.measureWidth(text + ell, p.seg.font) > maxWidth) {
      if (text.length === 0) {
        // 整段都删掉，尝试上一段
        pieces.splice(i, 1)
        break
      }
      text = text.slice(0, -1)
    }
    if (pieces.length > i) {
      pieces[i] = { text: text + ell, seg: p.seg }
      break
    }
    // 如 i === 0 且 pieces 为空，放 ell 在第一段
    if (i === 0 && pieces.length === 0 && line.pieces[0]) {
      pieces.push({ text: ell, seg: line.pieces[0].seg })
      break
    }
  }

  return { pieces, height: line.height }
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
