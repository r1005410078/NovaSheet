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
  type CellRange,
  type HoveredColumnHeaderMenu,
  type IconDef,
  type RenderFrameCollapsedColGap,
  type RenderFrameColumnGroupHeader,
  type Schema,
  type Theme,
  type ViewPipeline,
} from '@zhiguang/core'
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
  /** Phase 4.7 — 整列选中时需要强高亮的列头范围。 */
  selectedColumnRange?: Pick<CellRange, 'startCol' | 'endCol'>
  /** 当前 hover 的列头菜单按钮状态（来自 RenderFrame）。*/
  hoveredColumnHeaderMenu?: HoveredColumnHeaderMenu
  /**
   * 列组表头布局（来自 `RenderFrame.columnGroupHeader`）。缺省 = 零成本路径：
   * 单行叶头，行为与 M1 完全一致。存在时表头总高 = `depth × groupHeaderRowHeight + leafHeaderHeight`，
   * 组行画在叶行之上，叶行内容整体下移 `depth × groupHeaderRowHeight`。
   */
  columnGroupHeader?: RenderFrameColumnGroupHeader
  /**
   * 表头 leaf 行（字段名行）高度（来自 `viewport.leafHeaderHeight`）。只在 `columnGroupHeader`
   * 存在时生效；省略时回退 `theme.metrics.headerHeight`（与无列组时的叶行高一致）。
   */
  leafHeaderHeight?: number
}

const MIN_HEADER_HEIGHT_FOR_TRIANGLE = 24
const TRIANGLE_WIDTH = 6
const TRIANGLE_HEIGHT = 8

const HEADER_MENU_BUTTON_SIZE = 24
const MIN_HEADER_MENU_BUTTON_COL_WIDTH = 32
const HEADER_MENU_TRIANGLE_WIDTH = 8
const HEADER_MENU_TRIANGLE_HEIGHT = 5

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

  /** 绘制表头：先填充背景色，再逐列绘制字段名称文字；有列组时先画组行、叶行整体下移。 */
  paint(ctx: CanvasRenderingContext2D, params: HeaderPaintParams): void {
    const { schema, colsAxis, colRange, width } = params
    const x = params.x ?? 0
    const scrollOffsetX = params.scrollOffsetX ?? 0
    const columnGroupHeader = params.columnGroupHeader
    const groupRowHeight = this.theme.metrics.groupHeaderRowHeight
    // 无列组时 headerHeight 就是叶行高（M1 原语义，零成本路径）；有列组时是组行+叶行总高。
    const headerHeight = columnGroupHeader
      ? columnGroupHeader.depth * groupRowHeight + (params.leafHeaderHeight ?? this.theme.metrics.headerHeight)
      : this.theme.metrics.headerHeight

    ctx.save()
    ctx.beginPath()
    ctx.rect(x, 0, width, headerHeight)
    ctx.clip()

    // header 背景：占满当前 header 段（含列组表头行）；冻结列时 Renderer 会分段绘制。
    ctx.fillStyle = this.theme.colors.headerBackground
    ctx.fillRect(x, 0, width, headerHeight)

    if (colRange[1] < colRange[0]) {
      ctx.restore()
      return
    }

    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'

    if (columnGroupHeader) {
      this.paintColumnGroupRows(ctx, {
        columnGroupHeader,
        colsAxis,
        colRange,
        x,
        scrollOffsetX,
        groupRowHeight,
      })
    }

    const columnLetters = params.columnLetters === true
    const padX = this.theme.metrics.cellPaddingX
    for (let c = colRange[0]; c <= colRange[1]; c++) {
      if (!columnLetters && !schema.fields[c]) continue
      const colLeft = x + colsAxis.indexToPosition(c) - scrollOffsetX
      const colWidth = colsAxis.getSize(c)
      const selected = this.isSelectedColumn(c, params.selectedColumnRange)
      // 叶头伸满：无组/浅组列（leafTopRowByViewCol[c] < depth）从自身 topRow 一路画到表头底，
      // 而非局限于窄的叶行带——否则该列上方（组行区）会露出未绘制的空隙。
      const leafTop = this.leafTopForColumn(columnGroupHeader, groupRowHeight, c)
      if (selected) {
        ctx.fillStyle = this.theme.colors.selectionBorder
        ctx.fillRect(colLeft, leafTop, colWidth, headerHeight - leafTop)
      }
      const textColor = selected ? this.theme.colors.selectionText : this.theme.colors.headerText
      ctx.fillStyle = textColor
      const y = (leafTop + headerHeight) / 2
      if (columnLetters) {
        ctx.textAlign = 'center'
        ctx.fillText(columnIndexToLetter(c), colLeft + colWidth / 2, y)
        ctx.textAlign = 'left'
      } else {
        const field = schema.fields[c]!
        const icons = this.collectStateIcons(params.viewPipeline, field)
        const iconReserve = this.measureIconReserve(icons.length)
        const hoveredMenu = params.hoveredColumnHeaderMenu
        const showMenuButton =
          hoveredMenu?.colIndex === c && colWidth >= MIN_HEADER_MENU_BUTTON_COL_WIDTH
        const menuButtonReserve = showMenuButton ? HEADER_MENU_BUTTON_SIZE + padX : 0
        const align = this.theme.cell.headerTextAlign
        const maxTextWidth = Math.max(0, colWidth - padX * 2 - iconReserve - menuButtonReserve)
        const textX =
          align === 'center'
            ? colLeft + (colWidth - iconReserve - menuButtonReserve) / 2
            : align === 'right' || align === 'end'
              ? colLeft + colWidth - padX - iconReserve - menuButtonReserve
              : colLeft + padX
        ctx.textAlign = align
        ctx.fillText(field.name, textX, y, maxTextWidth)
        ctx.textAlign = 'left'
        // filter 图标用强调色，比 headerText 灰色更醒目
        const iconColor = icons.length > 0 ? this.theme.colors.selectionBorder : textColor
        this.paintStateIcons(ctx, icons, {
          colLeft,
          colWidth,
          y,
          padX,
          color: iconColor,
          rightReserve: menuButtonReserve,
        })
        if (showMenuButton) {
          this.paintHeaderMenuButton(ctx, colLeft, colWidth, y, hoveredMenu?.buttonHovered ?? false)
        }
      }
    }

    if (columnGroupHeader) {
      this.paintColumnGroupGridLines(ctx, {
        columnGroupHeader,
        colsAxis,
        colRange,
        x,
        width,
        scrollOffsetX,
        groupRowHeight,
        headerHeight,
      })
    }

    this.paintHeaderGridLines(ctx, {
      colsAxis,
      colRange,
      x,
      width,
      scrollOffsetX,
      headerHeight,
      columnGroupHeader,
      groupRowHeight,
    })
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
    // 已知未处理的交互：这里恒用叶行高 theme.metrics.headerHeight 定位 Y，没有加上
    // columnGroupHeader 的 depth×groupRowHeight 偏移——有列组时三角形会落进组行带，
    // 不是叶行带。列组场景下的隐藏列指示器定位是未来 follow-up，未在本次改动范围内。
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

  private paintHeaderMenuButton(
    ctx: CanvasRenderingContext2D,
    colLeft: number,
    colWidth: number,
    centerY: number,
    showCircle: boolean,
  ): void {
    const padX = this.theme.metrics.cellPaddingX
    const buttonSize = HEADER_MENU_BUTTON_SIZE
    const centerX = colLeft + colWidth - padX - buttonSize / 2

    ctx.save()
    if (showCircle) {
      ctx.fillStyle = this.theme.colors.headerMenuButtonBg
      ctx.beginPath()
      ctx.arc(centerX, centerY, buttonSize / 2, 0, Math.PI * 2)
      ctx.fill()
    }
    // triangle (dropdown arrow)
    ctx.fillStyle = this.theme.colors.headerText
    ctx.beginPath()
    ctx.moveTo(centerX - HEADER_MENU_TRIANGLE_WIDTH / 2, centerY - HEADER_MENU_TRIANGLE_HEIGHT / 2)
    ctx.lineTo(centerX + HEADER_MENU_TRIANGLE_WIDTH / 2, centerY - HEADER_MENU_TRIANGLE_HEIGHT / 2)
    ctx.lineTo(centerX, centerY + HEADER_MENU_TRIANGLE_HEIGHT / 2)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  private collectStateIcons(
    viewPipeline: Pick<ViewPipeline, 'collectHeaderDecorations'> | undefined,
    field: Schema['fields'][number],
  ): IconDef[] {
    const decoration = viewPipeline?.collectHeaderDecorations(field)
    const icons: IconDef[] = []
    if (decoration?.filterActive) icons.push(this.theme.icons.filter)
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
      color: string
      /** Extra space reserved on the right (e.g. menu button). Icons shift left by this amount. */
      rightReserve?: number
    },
  ): void {
    if (icons.length === 0) return
    const { headerIconSize, headerIconGap } = this.theme.metrics
    const totalWidth = icons.length * headerIconSize + (icons.length - 1) * headerIconGap
    const rightReserve = params.rightReserve ?? 0
    let iconX = params.colLeft + params.colWidth - params.padX - rightReserve - totalWidth
    const iconY = params.y - headerIconSize / 2

    for (const icon of icons) {
      paintSvgPath(
        ctx,
        icon.path,
        { width: 16, height: 16 },
        { x: iconX, y: iconY, width: headerIconSize, height: headerIconSize },
        { fill: params.color },
      )
      iconX += headerIconSize + headerIconGap
    }
  }

  private isSelectedColumn(
    colIndex: number,
    range: Pick<CellRange, 'startCol' | 'endCol'> | undefined,
  ): boolean {
    return range !== undefined && colIndex >= range.startCol && colIndex <= range.endCol
  }

  /**
   * 列组表头行绘制：每层 `columnGroupHeader.rows[level]` 各画一次背景 + label + 底边/右边分隔线。
   * 只在存在 `columnGroupHeader` 时调用——零成本路径不触碰此方法。
   *
   * 冻结/滚动分段：cell 的像素位置用绝对列坐标算出（不裁剪到本段 colRange），越出本段可见区
   * 的部分交给 paint() 顶部已建立的 ctx.clip() 兜底；跨段的组 cell 因此在两段各画一次自己的
   * 可见部分（spec §3.3），这里只需按 colRange 过滤掉与本段完全不相交的 cell。
   *
   * 边框只画每个 cell 自己的底边 + 右边（不画左边）——相邻 cell 的右边天然与下一个 cell 的
   * 左边共线；未在本层分组的列（浅组/无组，叶头向上伸满）没有 cell，也就不会有虚假分隔线
   * 穿过它们向上伸满的内容区。
   */
  private paintColumnGroupRows(
    ctx: CanvasRenderingContext2D,
    params: {
      columnGroupHeader: RenderFrameColumnGroupHeader
      colsAxis: Axis
      colRange: [number, number]
      x: number
      scrollOffsetX: number
      groupRowHeight: number
    },
  ): void {
    const { columnGroupHeader, colsAxis, colRange, x, scrollOffsetX, groupRowHeight } = params
    const padX = this.theme.metrics.cellPaddingX

    for (let level = 0; level < columnGroupHeader.depth; level++) {
      const rowTop = level * groupRowHeight
      const cells = columnGroupHeader.rows[level] ?? []

      for (const cell of cells) {
        if (cell.endViewCol < colRange[0] || cell.startViewCol > colRange[1]) continue

        const left = x + colsAxis.indexToPosition(cell.startViewCol) - scrollOffsetX
        const right =
          x + colsAxis.indexToPosition(cell.endViewCol) + colsAxis.getSize(cell.endViewCol) - scrollOffsetX

        ctx.fillStyle = cell.selected
          ? this.theme.colors.selectionBorder
          : this.theme.colors.headerBackground
        ctx.fillRect(left, rowTop, right - left, groupRowHeight)

        ctx.fillStyle = cell.selected ? this.theme.colors.selectionText : this.theme.colors.headerText
        const align = this.theme.cell.headerTextAlign
        const width = right - left
        const maxTextWidth = Math.max(0, width - padX * 2)
        const textX =
          align === 'center'
            ? left + width / 2
            : align === 'right' || align === 'end'
              ? right - padX
              : left + padX
        ctx.textAlign = align
        ctx.fillText(cell.label, textX, rowTop + groupRowHeight / 2, maxTextWidth)
        ctx.textAlign = 'left'
      }
    }
  }

  private paintColumnGroupGridLines(
    ctx: CanvasRenderingContext2D,
    params: {
      columnGroupHeader: RenderFrameColumnGroupHeader
      colsAxis: Axis
      colRange: [number, number]
      x: number
      width: number
      scrollOffsetX: number
      groupRowHeight: number
      headerHeight: number
    },
  ): void {
    const { columnGroupHeader, colsAxis, colRange, x, width, scrollOffsetX, groupRowHeight, headerHeight } =
      params

    ctx.strokeStyle = this.theme.colors.gridLine
    ctx.lineWidth = this.theme.metrics.borderWidth
    ctx.beginPath()

    for (let level = 0; level < columnGroupHeader.depth; level++) {
      const rowTop = level * groupRowHeight
      const rowBottom = rowTop + groupRowHeight
      const cells = columnGroupHeader.rows[level] ?? []

      for (const cell of cells) {
        if (cell.endViewCol < colRange[0] || cell.startViewCol > colRange[1]) continue

        const left = x + colsAxis.indexToPosition(cell.startViewCol) - scrollOffsetX
        const right =
          x + colsAxis.indexToPosition(cell.endViewCol) + colsAxis.getSize(cell.endViewCol) - scrollOffsetX

        const bottomY = snapLineInside(rowBottom, 0, headerHeight)
        if (bottomY !== undefined) {
          ctx.moveTo(left, bottomY)
          ctx.lineTo(right, bottomY)
        }
        const rightX = snapLineInside(right, x, x + width)
        if (rightX !== undefined) {
          ctx.moveTo(rightX, rowTop)
          ctx.lineTo(rightX, rowBottom)
        }
      }
    }

    ctx.stroke()
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
      columnGroupHeader: RenderFrameColumnGroupHeader | undefined
      groupRowHeight: number
    },
  ): void {
    const { colsAxis, colRange, x, width, scrollOffsetX, headerHeight, columnGroupHeader, groupRowHeight } =
      params
    ctx.strokeStyle = this.theme.colors.gridLine
    ctx.lineWidth = this.theme.metrics.borderWidth
    ctx.beginPath()

    for (let c = colRange[0]; c <= colRange[1]; c++) {
      const xBase = colsAxis.indexToPosition(c) + colsAxis.getSize(c)
      const xRaw = x + xBase - scrollOffsetX
      const lineX = snapLineInside(xRaw, x, x + width)
      if (lineX === undefined) continue
      // 边界线是 c 与 c+1 两列共享的分隔——取两列各自 leafTop 的较小值：谁的内容先到这个
      // Y，谁就需要这条线跟邻列（可能仍在组行区，或组行背景不同）分开。用单一全局值（如
      // depth×groupRowHeight）会让浅列一侧的分隔线漏画（见 review：无组列紧邻分组列时
      // 组行带内完全没有竖线）。c+1 越界时 leafTopForColumn 退化为 depth×groupRowHeight，
      // 即 c 自身 leafTop 的上界，min 自然收敛到 leafTopForColumn(c)，无需特判末列边界。
      const lineTop = Math.min(
        this.leafTopForColumn(columnGroupHeader, groupRowHeight, c),
        this.leafTopForColumn(columnGroupHeader, groupRowHeight, c + 1),
      )
      ctx.moveTo(lineX, lineTop)
      ctx.lineTo(lineX, headerHeight)
    }

    const bottom = snapLineInside(headerHeight, 0, headerHeight)
    if (bottom !== undefined) {
      ctx.moveTo(x, bottom)
      ctx.lineTo(x + width, bottom)
    }

    ctx.stroke()
  }

  /**
   * 某列自身叶头内容区的顶边 Y。无列组时恒为 0；`viewCol` 越界（如 gridline 边界的
   * `c+1` 落在整个 schema 最后一列之外）时退化为 `depth × groupRowHeight`——该列叶头带的
   * 最深可能值，恒 ≥ 任何真实列的 leafTop。与 paint() 主叶头循环共用同一份公式，避免
   * `?? columnGroupHeader.depth` 兜底逻辑重复两处。
   */
  private leafTopForColumn(
    columnGroupHeader: RenderFrameColumnGroupHeader | undefined,
    groupRowHeight: number,
    viewCol: number,
  ): number {
    return columnGroupHeader
      ? (columnGroupHeader.leafTopRowByViewCol[viewCol] ?? columnGroupHeader.depth) * groupRowHeight
      : 0
  }
}
