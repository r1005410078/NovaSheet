/**
 * CellPainter——按 FieldType 分派绘制单个单元格（spec §5.4）。
 *
 * M1 实现了两条专门路径 + 一条 fallback：
 *   - `text`：左对齐 + 文本省略号截断
 *   - `number`：右对齐 + `toLocaleString('en-US')` 千分位 + 省略号截断
 *   - 其他 5 种 FieldType（singleSelect / multiSelect / date / checkbox / url）：
 *     `String(value)` → 走 text 路径。M2/M3 加专属编辑器与绘制时只在此处补 case。
 *
 * 文本截断：二分搜索最长能容纳的前缀 + `…`，结果按 `${ctx.font}|${maxWidth}|${text}`
 * 缓存到 `truncationCache`（Map）。`setTheme` 会清空缓存（字体可能变）。M1 没有 LRU 上限，
 * M2 启用滚动后建议加上限以防极端场景内存爆涨（见 spec §9.1 风险）。
 *
 * `null` / `undefined` 值在最前面短路返回——既不 save/clip 也不 fillText，0 副作用。
 *
 * 整 cell 用 `ctx.save() + rect() + clip() + ... + restore()` 包住，防止长文本越过单元格。
 * 实测 600 个 cell × save/clip/restore < 3 ms，可接受。
 */

import type { CellValue, Field, QuadrantRect, TextMeasurer, Theme } from '@novasheet/core'
import { wrapText } from '@novasheet/core'

/** 行高倍数（默认 1.4 倍 fontSize）。可在 theme 里加 token 让它可配。 */
const LINE_HEIGHT_MULTIPLIER = 1.4

/** 单次单元格绘制所需参数 */
export interface CellPaintParams {
  /** undefined：异步源未加载；null：显式空。两者都不绘制。 */
  value: CellValue | undefined
  /** 单元格在画布上的矩形区域 */
  rect: QuadrantRect
  /** 字段定义（决定类型与对齐） */
  field: Field
}

/** CellPainter 构造选项 */
export interface CellPainterOptions {
  /**
   * 文本量度器，wrap 模式下用来度量每行宽度。未提供时 `field.wrap` 退化为单行截断。
   * Canvas2DBackend 会注入 `Canvas2DTextMeasurer` 实例。
   */
  measurer?: TextMeasurer
}

/**
 * 单元格绘制。两条专用快路径（text / number），其余 5 种 FieldType 走 fallback
 * （M1 占位，M2+ 加专属编辑器/绘制路径，到时候只补 switch case 不动 Schema）。
 *
 * 每个单元格做 ctx.save/clip/restore——保证长文本不会越界到相邻单元格，
 * 单次成本 ~5μs，M1 cell 数量下完全在 16ms 帧预算内。
 * 如果 profile 显示是热点，可以改成手动 clip：在 fillText 前与当前区域 rect 求交集。
 */
export class CellPainter {
  /**
   * (font|maxWidth|text) → 截断后的显示字符串。
   * 同一个值在多行重复出现（status 枚举等）非常常见——缓存命中率高。
   * setTheme 时清空，避免字体变化后残留过期截断。
   */
  private truncationCache = new Map<string, string>()
  private measurer: TextMeasurer | undefined

  constructor(
    private theme: Theme,
    options: CellPainterOptions = {},
  ) {
    this.measurer = options.measurer
  }

  /** 切换主题并清空截断缓存（字体变更后缓存失效） */
  setTheme(theme: Theme): void {
    this.theme = theme
    this.truncationCache.clear()
  }

  /** 注入或替换 TextMeasurer。autofit 触发时由 backend 调用确保 measurer 可用。 */
  setMeasurer(measurer: TextMeasurer): void {
    this.measurer = measurer
  }

  /** 绘制单个单元格：裁剪至矩形区域，按字段类型分发到对应绘制方法 */
  paint(ctx: CanvasRenderingContext2D, params: CellPaintParams): void {
    const { value, rect, field } = params
    // null / undefined 都不绘制：null = 显式空（与 SQL 语义一致），
    // undefined = 异步源缓存未命中（未来 M2+ 改成绘灰色占位骨架条）。
    if (value === null || value === undefined) return

    // 裁剪到单元格矩形，防止长文本溢出到邻格。
    ctx.save()
    ctx.beginPath()
    ctx.rect(rect.x, rect.y, rect.width, rect.height)
    ctx.clip()

    ctx.fillStyle = this.theme.colors.text
    ctx.textBaseline = 'middle'
    ctx.textAlign = this.theme.cell.textAlignByType[field.type]

    // 先 dispatch 专用路径；其他走 fallback 字符串化。
    // wrap 模式只对 text-likely 路径生效（number 仍单行右对齐）；measurer 缺席时退化单行。
    const wantWrap = field.wrap === true && field.type !== 'number' && this.measurer
    if (field.type === 'number' && typeof value === 'number') {
      this.paintNumber(ctx, value, rect)
    } else if (wantWrap) {
      const str = this.toDisplayString(value)
      this.paintWrapped(ctx, str, rect)
    } else if (field.type === 'text' && typeof value === 'string') {
      this.paintText(ctx, value, rect)
    } else {
      this.paintFallback(ctx, value, rect, field)
    }

    ctx.restore()
  }

  /** 把任意 CellValue 标准化为可绘文本（与 paintFallback 的逻辑保持一致）。 */
  private toDisplayString(value: CellValue): string {
    if (value instanceof Date) return value.toISOString()
    if (Array.isArray(value)) return value.join(', ')
    return String(value)
  }

  /**
   * 多行换行绘制（wrap=true 时启用）。
   *
   * 行高 = fontSize × 1.4。可用高度不够展示全部行时，最后一行末尾用 `…` 截断。
   * 垂直起点：cell.y + padY + lineHeight/2（与 `textBaseline='middle'` 对齐）。
   *
   * 性能：单元格内 wrapText 调用 measurer.measureWidth 若干次，受 Canvas2DTextMeasurer
   * LRU 缓存命中率影响——typical 同一列同字体 + 重复值时命中率高。
   */
  private paintWrapped(ctx: CanvasRenderingContext2D, text: string, rect: QuadrantRect): void {
    if (!this.measurer || text.length === 0) return
    const padX = this.theme.metrics.cellPaddingX
    const padY = this.theme.metrics.cellPaddingY
    const fontSize = this.theme.metrics.fontSize
    const lineHeight = fontSize * LINE_HEIGHT_MULTIPLIER
    const maxWidth = rect.width - padX * 2
    const availableHeight = rect.height - padY * 2
    if (maxWidth <= 0 || availableHeight <= 0) return
    // 与 autofit 的 `lines × lineHeight + padY×2` 互逆；微量补偿浮点误差，避免少算一行而出现 `…`
    const maxLines = Math.max(1, Math.floor((availableHeight + lineHeight * 0.01) / lineHeight))

    const wrapped = wrapText(
      text,
      { font: ctx.font, maxWidth, lineHeight, maxLines },
      this.measurer,
    )
    if (wrapped.lines.length === 0) return

    const baseX = rect.x + padX
    const firstY = rect.y + padY + lineHeight / 2
    for (let i = 0; i < wrapped.lines.length; i++) {
      const line = wrapped.lines[i]!
      ctx.fillText(line, baseX, firstY + i * lineHeight)
    }
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
    // 固定用 'en-US' 千分位——与浏览器 locale 解耦，避免不同用户跑出不同结果（影响测试和回归）。
    // 真正的本地化在更高层处理，M2+ 引入 locale-aware 字段时再做。
    const text = value.toLocaleString('en-US')
    const padX = this.theme.metrics.cellPaddingX
    const availableWidth = rect.width - padX * 2
    const display = this.truncate(ctx, text, availableWidth)
    if (!display) return
    // 右对齐：锚点在 padding 内沿右边界；textAlign='right' 由调用方 paint() 设置
    // （theme.cell.textAlignByType.number === 'right'）。
    const x = rect.x + rect.width - padX
    const y = rect.y + rect.height / 2
    ctx.fillText(display, x, y)
  }

  /**
   * 把值字符串化后走 text 路径——M1 里 5 种非 text/number FieldType 的 fallback。
   * 见 CLAUDE.md「Things explicitly NOT in M1」。
   */
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

  /**
   * 找出 `text` 能放进 `maxWidth` 的最长前缀，末尾拼 "…"；
   * 整串放得下直接返回原文；连省略号都放不下返回空串（极窄列）。
   *
   * 二分搜索把 measureText 调用次数压到 O(log n) per cell（80 字符 → ~7 次而非 80 次）。
   * 缓存 key 是 (font|width|text)，让多行重复值（status 枚举等）命中率最大化。
   */
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
    // 二分：找最大的 lo，使 prefix[0..lo) + '…' 仍能放进 maxWidth。
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
