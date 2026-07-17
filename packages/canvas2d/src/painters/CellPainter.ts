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
 * 缓存到 `truncationCache`（Map）。`setTheme` 会清空缓存（字体可能变）。缓存上限 `TRUNCATION_CACHE_MAX`（8192），超限整体清空。
 *
 * `null` / `undefined` 值在最前面短路返回——既不 save/clip 也不 fillText，0 副作用。
 *
 * 整 cell 用 `ctx.save() + rect() + clip() + ... + restore()` 包住，防止长文本越过单元格。
 * 实测 600 个 cell × save/clip/restore < 3 ms，可接受。
 */

import type {
  CellValue,
  Field,
  QuadrantRect,
  TextMeasurer,
  TextWrapMode,
  Theme,
} from '@zhiguang/novasheet-core'
import { wrapText } from '@zhiguang/novasheet-core'

/** 行高倍数（默认 1.4 倍 fontSize）。可在 theme 里加 token 让它可配。 */
const LINE_HEIGHT_MULTIPLIER = 1.4

/** 截断缓存上限；推送型数据每 tick 产生新字符串，无上限会无界增长。超限整体清空。 */
const TRUNCATION_CACHE_MAX = 8192

/** 单次单元格绘制所需参数 */
export interface CellPaintParams {
  /** undefined：异步源未加载；null：显式空。两者都不绘制。 */
  value: CellValue | undefined
  /** 单元格在画布上的矩形区域 */
  rect: QuadrantRect
  /** 字段定义（决定类型与对齐） */
  field: Field
  /** 文本显示模式；缺省回退 `field.wrap?'wrap':'overflow'`（由 RangeStyleStore 解析后传入）。 */
  textWrap?: TextWrapMode
  /** view 坐标，供 formatCell 查 cell 级 valueFormat（Phase 5-C）。 */
  rowIndex?: number
  colIndex?: number
  /** Phase 5-C — frame 的值格式化解析器；返回 undefined 时回退默认显示路径（零回归）。 */
  formatCell?: (rowIndex: number, colIndex: number, field: Field, value: CellValue) => string | undefined
  /** Phase B — frame 的 view 坐标附件解析器；供 custom renderer（如 rich-text）读 runs。 */
  getAttachment?: <T>(namespace: string, viewRow: number, viewCol: number) => T | undefined
  /** Validation — 'invalid' 时绘制红边框 + 角标；'pending'/'ok'/undefined 不绘制。 */
  validationState?: 'ok' | 'invalid' | 'pending'
}

/** Canvas2D custom renderer 收到的单元格绘制上下文。 */
export interface Canvas2DCellRenderParams extends CellPaintParams {
  /** 当前 theme；外部 renderer 可优先复用 NovaSheet 视觉 token。 */
  readonly theme: Theme
  /** CellPainter 注入的文本量度器；wrap 模式下 rich-text renderer 可直接复用。 */
  readonly measurer?: TextMeasurer
}

/** Task 6 接入 action routing 前，仅声明 Canvas2D renderer 可返回的 hit zone 形状。 */
export interface Canvas2DCellActionZone {
  readonly id: string
  readonly rect: QuadrantRect
  readonly cursor?: 'pointer' | 'text' | 'default'
  readonly label?: string
}

/** Canvas2D-only 单元格 renderer。 */
export interface Canvas2DCellRenderer {
  paint(ctx: CanvasRenderingContext2D, params: Canvas2DCellRenderParams): void
  getActionZones?(params: Canvas2DCellRenderParams): readonly Canvas2DCellActionZone[]
}

/** field.type -> Canvas2D-only renderer registry。 */
export type Canvas2DCellRendererRegistry = Readonly<Record<string, Canvas2DCellRenderer>>

/** CellPainter 构造选项 */
export interface CellPainterOptions {
  /**
   * 文本量度器，wrap 模式下用来度量每行宽度。未提供时 `field.wrap` 退化为单行截断。
   * `canvas2dBackend` 工厂会注入 `Canvas2DTextMeasurer` 实例。
   */
  measurer?: TextMeasurer
  /** Canvas2D-only custom renderer registry；命中时优先于内置文本 fallback。 */
  cellRenderers?: Canvas2DCellRendererRegistry
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
  private cellRenderers: Canvas2DCellRendererRegistry

  constructor(
    private theme: Theme,
    options: CellPainterOptions = {},
  ) {
    this.measurer = options.measurer
    this.cellRenderers = options.cellRenderers ?? {}
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
    if (value === null || value === undefined) {
      if (params.validationState === 'invalid') this.paintValidationIndicator(ctx, rect)
      return
    }

    // 裁剪到单元格矩形，防止长文本溢出到邻格。
    ctx.save()
    ctx.beginPath()
    ctx.rect(rect.x, rect.y, rect.width, rect.height)
    ctx.clip()

    const custom = this.cellRenderers[field.type]
    if (custom) {
      custom.paint(ctx, { ...params, theme: this.theme, measurer: this.measurer })
      ctx.restore()
      return
    }

    ctx.fillStyle = this.theme.colors.text
    ctx.textBaseline = 'middle'
    ctx.textAlign = this.getTextAlign(field)

    // Phase 5-C：若 rowIndex/colIndex 已知且 formatCell 存在，尝试获取格式化文本。
    // 返回 undefined 时各绘制分支回退现有默认路径，保证未格式化格零回归。
    const formatted =
      params.rowIndex !== undefined && params.colIndex !== undefined
        ? params.formatCell?.(params.rowIndex, params.colIndex, field, value)
        : undefined

    // 解析文本显示模式：显式 textWrap 优先，否则回退列级 field.wrap（true→wrap），都无则 overflow。
    const mode: TextWrapMode = params.textWrap ?? (field.wrap === true ? 'wrap' : 'overflow')
    if (field.type === 'number' && typeof value === 'number') {
      this.paintNumber(ctx, value, rect, formatted)
    } else if (mode === 'wrap' && field.type !== 'number' && this.measurer) {
      this.paintWrapped(ctx, formatted ?? this.toDisplayString(value), rect)
    } else if (field.type === 'text' && typeof value === 'string') {
      // overflow / clip：按 \n 多行、每行硬裁断无省略号（overflow 的溢出由 renderer 扩展 clip 实现）。
      this.paintLines(ctx, formatted ?? value, rect)
    } else {
      this.paintFallback(ctx, value, rect, field, formatted)
    }

    ctx.restore()
    if (params.validationState === 'invalid') this.paintValidationIndicator(ctx, rect)
  }

  /** 返回 custom renderer 声明的 action hit zones；内置/fallback 单元格无 action。 */
  getActionZones(params: CellPaintParams): readonly Canvas2DCellActionZone[] {
    return this.cellRenderers[params.field.type]?.getActionZones?.({
      ...params,
      theme: this.theme,
      measurer: this.measurer,
    }) ?? []
  }

  private paintValidationIndicator(ctx: CanvasRenderingContext2D, rect: QuadrantRect): void {
    const v = this.theme.validation
    const s = v.markerSize
    ctx.save()
    ctx.fillStyle = v.markerColor
    ctx.beginPath()
    ctx.moveTo(rect.x + rect.width - s, rect.y)
    ctx.lineTo(rect.x + rect.width, rect.y)
    ctx.lineTo(rect.x + rect.width, rect.y + s)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  private getTextAlign(field: Field): CanvasTextAlign {
    switch (field.type) {
      case 'text':
        return this.theme.cell.textAlignByType.text
      case 'singleSelect':
        return this.theme.cell.textAlignByType.singleSelect
      case 'multiSelect':
        return this.theme.cell.textAlignByType.multiSelect
      case 'date':
        return this.theme.cell.textAlignByType.date
      case 'checkbox':
        return this.theme.cell.textAlignByType.checkbox
      case 'url':
        return this.theme.cell.textAlignByType.url
      case 'number':
        return this.theme.cell.textAlignByType.number
      default:
        return this.theme.cell.textAlignByType.text
    }
  }

  /** 把任意 CellValue 标准化为可绘文本（与 paintFallback 的逻辑保持一致）。 */
  private toDisplayString(value: CellValue): string {
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

    const baseX = this.resolveTextX(rect, ctx.textAlign)
    const firstY = rect.y + padY + lineHeight / 2
    for (let i = 0; i < wrapped.lines.length; i++) {
      const line = wrapped.lines[i]!
      ctx.fillText(line, baseX, firstY + i * lineHeight)
    }
  }

  /**
   * overflow / clip 的文本绘制：按 `\n` 切行，每行**硬裁断、无省略号**（对齐 Excel/Sheets）。
   * 单行时垂直居中；多行时自顶向下堆叠（与 paintWrapped 一致），放不下的行裁掉。
   * overflow 的横向溢出由 renderer 传入扩展 clip 实现——本方法只负责整串绘制与按行裁断。
   */
  private paintLines(ctx: CanvasRenderingContext2D, text: string, rect: QuadrantRect): void {
    const padX = this.theme.metrics.cellPaddingX
    const availableWidth = rect.width - padX * 2
    if (availableWidth <= 0) return
    const x = this.resolveTextX(rect, ctx.textAlign)
    const lines = text.split('\n')
    if (lines.length === 1) {
      const display = this.hardCut(ctx, lines[0]!, availableWidth)
      if (display) ctx.fillText(display, x, rect.y + rect.height / 2)
      return
    }
    const padY = this.theme.metrics.cellPaddingY
    const lineHeight = this.theme.metrics.fontSize * LINE_HEIGHT_MULTIPLIER
    const availableHeight = rect.height - padY * 2
    if (availableHeight <= 0) return
    const maxLines = Math.max(1, Math.floor((availableHeight + lineHeight * 0.01) / lineHeight))
    const firstY = rect.y + padY + lineHeight / 2
    for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
      const display = this.hardCut(ctx, lines[i]!, availableWidth)
      if (display) ctx.fillText(display, x, firstY + i * lineHeight)
    }
  }

  /** 绘制数字类型单元格（按 theme.cell.textAlignByType.number 对齐，默认右对齐）。preformatted 非 undefined 时跳过 toLocaleString。 */
  private paintNumber(ctx: CanvasRenderingContext2D, value: number, rect: QuadrantRect, preformatted?: string): void {
    // 固定用 'en-US' 千分位——与浏览器 locale 解耦，避免不同用户跑出不同结果（影响测试和回归）。
    // 真正的本地化在更高层处理，M2+ 引入 locale-aware 字段时再做。
    const text = preformatted ?? value.toLocaleString('en-US')
    const padX = this.theme.metrics.cellPaddingX
    const availableWidth = rect.width - padX * 2
    const display = this.truncate(ctx, text, availableWidth)
    if (!display) return
    const x = this.resolveTextX(rect, ctx.textAlign)
    const y = rect.y + rect.height / 2
    ctx.fillText(display, x, y)
  }

  /**
   * 按 textAlign 计算 fillText 水平锚点（与 cellPaddingX 配合）。
   * @param rect 单元格矩形
   * @param align Canvas textAlign
   */
  private resolveTextX(rect: QuadrantRect, align: CanvasTextAlign): number {
    const padX = this.theme.metrics.cellPaddingX
    if (align === 'right' || align === 'end') return rect.x + rect.width - padX
    if (align === 'center') return rect.x + rect.width / 2
    return rect.x + padX
  }

  /**
   * 把值字符串化后走 text 路径——M1 里 5 种非 text/number FieldType 的 fallback。
   * preformatted 非 undefined 时直接用格式化文本，跳过 toDisplayString。
   * 见 CLAUDE.md「Things explicitly NOT in M1」。
   */
  private paintFallback(
    ctx: CanvasRenderingContext2D,
    value: CellValue,
    rect: QuadrantRect,
    _field: Field,
    preformatted?: string,
  ): void {
    let str: string
    if (preformatted !== undefined) str = preformatted
    else if (Array.isArray(value)) str = value.join(', ')
    else str = String(value)
    this.paintLines(ctx, str, rect)
  }

  /**
   * 缓存截断结果，超过容量上限时整体清空。
   */
  private cacheTruncation(key: string, value: string): string {
    if (this.truncationCache.size >= TRUNCATION_CACHE_MAX) this.truncationCache.clear()
    this.truncationCache.set(key, value)
    return value
  }

  /**
   * 找出 `text` 能放进 `maxWidth` 的最长前缀（**硬裁断、无省略号**），整串放得下返回原文。
   * 二分把 measureText 压到 O(log n)；缓存 key 含 `hc|` 前缀以与省略号截断区分。
   */
  private hardCut(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (maxWidth <= 0) return ''
    const cacheKey = `hc|${ctx.font}|${maxWidth}|${text}`
    const cached = this.truncationCache.get(cacheKey)
    if (cached !== undefined) return cached
    let result = text
    if (ctx.measureText(text).width > maxWidth) {
      let lo = 0
      let hi = text.length
      while (lo < hi) {
        const mid = (lo + hi + 1) >>> 1
        if (ctx.measureText(text.slice(0, mid)).width <= maxWidth) lo = mid
        else hi = mid - 1
      }
      result = text.slice(0, lo)
    }
    return this.cacheTruncation(cacheKey, result)
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
      return this.cacheTruncation(cacheKey, text)
    }
    const ellipsis = '…'
    const ellipsisWidth = ctx.measureText(ellipsis).width
    if (ellipsisWidth > maxWidth) {
      return this.cacheTruncation(cacheKey, '')
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
    return this.cacheTruncation(cacheKey, result)
  }
}
