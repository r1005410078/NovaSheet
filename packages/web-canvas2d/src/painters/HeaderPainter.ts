/**
 * HeaderPainter——绘制顶部列头条（spec §5.6）。
 *
 * M1 内容：headerBackground 填充 + 每列绘制字段名（左对齐、垂直居中、`…` 截断）。
 * 不绘制字段类型 icon——Theme.icons 已备好，M2/M3 给 header 加 icon / 排序图标 /
 * 列拖拽 indicator 时再消费。
 *
 * Header 永远在最顶层，最后绘（spec §5.3 顺序），覆盖滚动区。冻结列的 header 段在
 * 主 header 之后再绘一次（M3 才会启用，因为 M1 没有冻结列）。
 */

import {
  columnIndexToLetter,
  type Axis,
  type IconDef,
  type RenderFrameCollapsedColGap,
  type Schema,
  type Theme,
  type ViewPipeline,
} from '@novasheet/core'
import { snapLineInside } from '../paint/line-snap'
import { paintSvgPath } from '../paint/svg-path'

/** 表头绘制所需参数 */
export interface HeaderPaintParams {
  /** 数据 Schema（提供字段名称） */
  schema: Schema
  /** 列轴（提供列宽与位置查询） */
  colsAxis: Axis
  /** 可见列索引区间（两端均闭） */
  colRange: [number, number]
  /** header 段宽度。无冻结时等于 viewport 宽度；冻结列时是当前段宽度。 */
  width: number
  /** header 段在 canvas 上的 x。冻结列时 scrollable header 从冻结列右侧开始。 */
  x?: number
  /**
   * 横向滚动偏移。header 跟列内容左右联动（cell 减去 scrollX，header 也要减），
   * 否则横向滚动后字段名会被画到 viewport 之外。M3 冻结列的 header 段
   * 由 Renderer 单独传 scrollOffsetX=0 再绘一次覆盖。
   */
  scrollOffsetX?: number
  /** true 时绘制 A/B/… 列标（Excel 门面） */
  columnLetters?: boolean
  /** Phase 4.4 — 提供列头排序/筛选状态装饰。 */
  viewPipeline?: Pick<ViewPipeline, 'collectHeaderDecorations'>
  /** Phase 4.6 — 折叠列间隙，用于绘制 hide indicator。 */
  collapsedColGaps?: readonly RenderFrameCollapsedColGap[]
}

const MIN_HEADER_HEIGHT_FOR_TRIANGLE = 24
const TRIANGLE_WIDTH = 6
const TRIANGLE_HEIGHT = 8

/**
 * 列头绘制。M1 只画字段名；M2+ 加排序箭头、字段类型 icon、resize handle 命中区时
 * 都在这里扩展（icon path 已在 theme.icons.byFieldType 准备好）。
 */
export class HeaderPainter {
  constructor(private theme: Theme) {}

  /** 切换主题 */
  setTheme(theme: Theme): void {
    this.theme = theme
  }

  /** 绘制表头：先填充背景色，再逐列绘制字段名称文字 */
  paint(ctx: CanvasRenderingContext2D, params: HeaderPaintParams): void {
    const { schema, colsAxis, colRange, width } = params
    const x = params.x ?? 0
    const scrollOffsetX = params.scrollOffsetX ?? 0
    const headerHeight = this.theme.metrics.headerHeight

    ctx.save()
    ctx.beginPath()
    ctx.rect(x, 0, width, headerHeight)
    ctx.clip()

    // header 背景：占满当前 header 段；冻结列时 Renderer 会分段绘制。
    ctx.fillStyle = this.theme.colors.headerBackground
    ctx.fillRect(x, 0, width, headerHeight)

    if (colRange[1] < colRange[0]) {
      ctx.restore()
      return
    }

    ctx.fillStyle = this.theme.colors.headerText
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'

    const columnLetters = params.columnLetters === true
    const padX = this.theme.metrics.cellPaddingX
    for (let c = colRange[0]; c <= colRange[1]; c++) {
      if (!columnLetters && !schema.fields[c]) continue
      const colLeft = x + colsAxis.indexToPosition(c) - scrollOffsetX
      const colWidth = colsAxis.getSize(c)
      const y = headerHeight / 2
      if (columnLetters) {
        ctx.textAlign = 'center'
        ctx.fillText(columnIndexToLetter(c), colLeft + colWidth / 2, y)
        ctx.textAlign = 'left'
      } else {
        const field = schema.fields[c]!
        const icons = this.collectStateIcons(params.viewPipeline, field)
        const iconReserve = this.measureIconReserve(icons.length)
        const textX = colLeft + padX
        const maxTextWidth = Math.max(0, colWidth - padX * 2 - iconReserve)
        ctx.fillText(field.name, textX, y, maxTextWidth)
        this.paintStateIcons(ctx, icons, {
          colLeft,
          colWidth,
          y,
          padX,
        })
      }
    }

    this.paintHeaderGridLines(ctx, { colsAxis, colRange, x, width, scrollOffsetX, headerHeight })
    this.paintCollapsedColGaps(ctx, params)

    ctx.restore()
  }

  private paintCollapsedColGaps(
    ctx: CanvasRenderingContext2D,
    params: HeaderPaintParams,
  ): void {
    const gaps = params.collapsedColGaps ?? []
    if (gaps.length === 0) return
    const headerHeight = this.theme.metrics.headerHeight
    if (headerHeight < MIN_HEADER_HEIGHT_FOR_TRIANGLE) return

    const x = params.x ?? 0
    const width = params.width
    const { hideColTriangleOffset, hideColTrianglePadY } = this.theme.dimensions
    const leftPath = new Path2D(
      `M${TRIANGLE_WIDTH} 0 L0 ${TRIANGLE_HEIGHT / 2} L${TRIANGLE_WIDTH} ${TRIANGLE_HEIGHT} Z`,
    )
    const rightPath = new Path2D(
      `M0 0 L${TRIANGLE_WIDTH} ${TRIANGLE_HEIGHT / 2} L0 ${TRIANGLE_HEIGHT} Z`,
    )
    const y = headerHeight - hideColTrianglePadY - TRIANGLE_HEIGHT

    ctx.fillStyle = this.theme.colors.hideIndicator
    for (const gap of gaps) {
      if (gap.xPx < x || gap.xPx > x + width) continue
      this.drawTriangle(ctx, leftPath, gap.xPx - hideColTriangleOffset - TRIANGLE_WIDTH, y)
      this.drawTriangle(ctx, rightPath, gap.xPx + hideColTriangleOffset, y)
    }
  }

  private drawTriangle(
    ctx: CanvasRenderingContext2D,
    path: Path2D,
    x: number,
    y: number,
  ): void {
    ctx.save()
    ctx.translate(x, y)
    ctx.fill(path)
    ctx.restore()
  }

  private collectStateIcons(
    viewPipeline: Pick<ViewPipeline, 'collectHeaderDecorations'> | undefined,
    field: Schema['fields'][number],
  ): IconDef[] {
    const decoration = viewPipeline?.collectHeaderDecorations(field)
    const icons: IconDef[] = []
    if (decoration?.filterActive) icons.push(this.theme.icons.filter)
    if (decoration?.sortIndicator === 'asc') icons.push(this.theme.icons.sortAsc)
    if (decoration?.sortIndicator === 'desc') icons.push(this.theme.icons.sortDesc)
    return icons
  }

  private measureIconReserve(count: number): number {
    if (count === 0) return 0
    const { headerIconSize, headerIconGap } = this.theme.metrics
    return count * headerIconSize + count * headerIconGap
  }

  private paintStateIcons(
    ctx: CanvasRenderingContext2D,
    icons: readonly IconDef[],
    params: {
      colLeft: number
      colWidth: number
      y: number
      padX: number
    },
  ): void {
    if (icons.length === 0) return
    const { headerIconSize, headerIconGap } = this.theme.metrics
    const totalWidth = icons.length * headerIconSize + (icons.length - 1) * headerIconGap
    let iconX = params.colLeft + params.colWidth - params.padX - totalWidth
    const iconY = params.y - headerIconSize / 2

    for (const icon of icons) {
      paintSvgPath(
        ctx,
        icon.path,
        { width: 16, height: 16 },
        { x: iconX, y: iconY, width: headerIconSize, height: headerIconSize },
        { fill: this.theme.colors.headerText },
      )
      iconX += headerIconSize + headerIconGap
    }
  }

  private paintHeaderGridLines(
    ctx: CanvasRenderingContext2D,
    params: {
      colsAxis: Axis
      colRange: [number, number]
      x: number
      width: number
      scrollOffsetX: number
      headerHeight: number
    },
  ): void {
    const { colsAxis, colRange, x, width, scrollOffsetX, headerHeight } = params
    ctx.strokeStyle = this.theme.colors.gridLine
    ctx.lineWidth = this.theme.metrics.borderWidth
    ctx.beginPath()

    for (let c = colRange[0]; c <= colRange[1]; c++) {
      const xBase = colsAxis.indexToPosition(c) + colsAxis.getSize(c)
      const xRaw = x + xBase - scrollOffsetX
      const lineX = snapLineInside(xRaw, x, x + width)
      if (lineX === undefined) continue
      ctx.moveTo(lineX, 0)
      ctx.lineTo(lineX, headerHeight)
    }

    const bottom = snapLineInside(headerHeight, 0, headerHeight)
    if (bottom !== undefined) {
      ctx.moveTo(x, bottom)
      ctx.lineTo(x + width, bottom)
    }

    ctx.stroke()
  }
}
