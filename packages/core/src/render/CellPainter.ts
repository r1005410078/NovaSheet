import type { CellValue, Field } from '../data/Schema'
import type { QuadrantRect } from '../layout/FrozenRegions'
import type { Theme } from '../theme/Theme'

export interface CellPaintParams {
  value: CellValue | undefined
  rect: QuadrantRect
  field: Field
}

export class CellPainter {
  private truncationCache = new Map<string, string>()

  constructor(private theme: Theme) {}

  setTheme(theme: Theme): void {
    this.theme = theme
    this.truncationCache.clear()
  }

  paint(ctx: CanvasRenderingContext2D, params: CellPaintParams): void {
    const { value, rect, field } = params
    if (value === null || value === undefined) return

    ctx.save()
    ctx.beginPath()
    ctx.rect(rect.x, rect.y, rect.width, rect.height)
    ctx.clip()

    ctx.fillStyle = this.theme.colors.text
    ctx.textBaseline = 'middle'
    ctx.textAlign = this.theme.cell.textAlignByType[field.type]

    if (field.type === 'number' && typeof value === 'number') {
      this.paintNumber(ctx, value, rect)
    } else if (field.type === 'text' && typeof value === 'string') {
      this.paintText(ctx, value, rect)
    } else {
      this.paintFallback(ctx, value, rect, field)
    }

    ctx.restore()
  }

  private paintText(ctx: CanvasRenderingContext2D, text: string, rect: QuadrantRect): void {
    const padX = this.theme.metrics.cellPaddingX
    const availableWidth = rect.width - padX * 2
    const display = this.truncate(ctx, text, availableWidth)
    if (!display) return
    const x = rect.x + padX
    const y = rect.y + rect.height / 2
    ctx.fillText(display, x, y)
  }

  private paintNumber(ctx: CanvasRenderingContext2D, value: number, rect: QuadrantRect): void {
    const text = value.toLocaleString('en-US') // 千分位
    const padX = this.theme.metrics.cellPaddingX
    const availableWidth = rect.width - padX * 2
    const display = this.truncate(ctx, text, availableWidth)
    if (!display) return
    const x = rect.x + rect.width - padX
    const y = rect.y + rect.height / 2
    ctx.fillText(display, x, y)
  }

  private paintFallback(
    ctx: CanvasRenderingContext2D,
    value: CellValue,
    rect: QuadrantRect,
    _field: Field,
  ): void {
    let str: string
    if (value instanceof Date) str = value.toISOString()
    else if (Array.isArray(value)) str = value.join(', ')
    else str = String(value)
    this.paintText(ctx, str, rect)
  }

  private truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (maxWidth <= 0) return ''
    const cacheKey = `${ctx.font}|${maxWidth}|${text}`
    const cached = this.truncationCache.get(cacheKey)
    if (cached !== undefined) return cached

    const fullWidth = ctx.measureText(text).width
    if (fullWidth <= maxWidth) {
      this.truncationCache.set(cacheKey, text)
      return text
    }
    const ellipsis = '…'
    const ellipsisWidth = ctx.measureText(ellipsis).width
    if (ellipsisWidth > maxWidth) {
      this.truncationCache.set(cacheKey, '')
      return ''
    }
    // Binary search for the largest prefix fitting in (maxWidth - ellipsisWidth)
    let lo = 0
    let hi = text.length
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1
      const w = ctx.measureText(text.slice(0, mid)).width
      if (w + ellipsisWidth <= maxWidth) lo = mid
      else hi = mid - 1
    }
    const result = text.slice(0, lo) + ellipsis
    this.truncationCache.set(cacheKey, result)
    return result
  }
}
