import type { CellValue, Field } from '../data/Schema'
import type { QuadrantRect } from '../layout/FrozenRegions'
import type { Theme } from '../theme/Theme'

/** 单次单元格绘制所需参数 */
export interface CellPaintParams {
  /** 单元格值（undefined 时跳过绘制） */
  value: CellValue | undefined
  /** 单元格在画布上的矩形区域 */
  rect: QuadrantRect
  /** 字段定义（决定类型与对齐） */
  field: Field
}

/** 负责将单个单元格的值渲染到画布，含截断缓存优化 */
export class CellPainter {
  /** 截断结果缓存，key = `font|maxWidth|text` */
  private truncationCache = new Map<string, string>()

  constructor(private theme: Theme) {}

  /** 切换主题并清空截断缓存（字体变更后缓存失效） */
  setTheme(theme: Theme): void {
    this.theme = theme
    this.truncationCache.clear()
  }

  /** 绘制单个单元格：裁剪至矩形区域，按字段类型分发到对应绘制方法 */
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

  /** 绘制文本类型单元格（左对齐，超长截断加省略号） */
  private paintText(ctx: CanvasRenderingContext2D, text: string, rect: QuadrantRect): void {
    const padX = this.theme.metrics.cellPaddingX
    const availableWidth = rect.width - padX * 2
    const display = this.truncate(ctx, text, availableWidth)
    if (!display) return
    const x = rect.x + padX
    const y = rect.y + rect.height / 2
    ctx.fillText(display, x, y)
  }

  /** 绘制数字类型单元格（右对齐，千分位格式化） */
  private paintNumber(ctx: CanvasRenderingContext2D, value: number, rect: QuadrantRect): void {
    const text = value.toLocaleString('en-US') // 千分位格式化
    const padX = this.theme.metrics.cellPaddingX
    const availableWidth = rect.width - padX * 2
    const display = this.truncate(ctx, text, availableWidth)
    if (!display) return
    const x = rect.x + rect.width - padX
    const y = rect.y + rect.height / 2
    ctx.fillText(display, x, y)
  }

  /** 兜底绘制：Date → ISO 字符串，数组 → 逗号拼接，其他 → String() 转换后走文本路径 */
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

  /** 截断文本至 maxWidth 内，超出时用二分查找确定最大前缀并附加省略号，结果缓存 */
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
    // 二分查找：找到能放入 (maxWidth - ellipsisWidth) 的最长前缀
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
