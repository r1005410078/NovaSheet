import type { ChunkedAxis } from '../../kernel/geometry/ChunkedAxis'
import { FrozenRegions } from '../../kernel/geometry/FrozenRegions'
import type { FrozenConfig } from '../../kernel/geometry/FrozenRegions'
import { Viewport } from '../../kernel/geometry/Viewport'
import type { Theme } from '../../kernel/theme/Theme'
import type { Schema } from '../../kernel/data/Schema'

/** excel 风格 row header 的最小 gutter 宽度（与抽离前 engine 常量一致）。 */
const DEFAULT_EXCEL_ROW_HEADER_WIDTH = 44

/** 构造 `DefaultLayoutState` 所需输入：theme/schema 派生，不含 axes（两阶段生命周期第一阶段）。 */
export interface LayoutStateInput {
  readonly theme: Theme
  readonly explicitDefaultRowHeight: number | undefined
  readonly excelHeaders: boolean
  readonly frozenInput: Partial<FrozenConfig> | undefined
  readonly getSchema: () => Schema
  /** 当前列组表头深度（层数）；无列组时返回 0。闭包指向 engine 的 ColumnGroupStore。 */
  readonly getGroupHeaderDepth: () => number
}

/**
 * Layout 领域聚合根：自持 view axes + frozen + viewport，并集中 layout 初始化/rebuild 规则。
 *
 * 两阶段生命周期：构造后即可答默认值派生（`resolveDefaultRowHeight`/`averageColWidth`，供 row/column
 * 结构构造回调）；待结构产出 view axis 后调 `initView` 装配 frozen+viewport。push 模型：engine 把
 * 结构 pull 出的 view axis 传入，本领域不反调 row/column。
 */
export interface LayoutState {
  resolveDefaultRowHeight(): number
  averageColWidth(): number
  initView(rowsAxis: ChunkedAxis, colsAxis: ChunkedAxis): void
  rebuildRows(rowsAxis: ChunkedAxis): void
  rebuildCols(colsAxis: ChunkedAxis): void
  applyTheme(theme: Theme): void
  remapFrozenAfterColInsert(at: number, count: number, oldTotalCols: number): void
  remapFrozenAfterColDelete(removedIndices: readonly number[], totalColsBefore: number): void
  setFrozenConfig(config: Partial<FrozenConfig>): void
  setViewportSize(width: number, height: number): void
  setScroll(logicalX: number, logicalY: number): void
  /** 设置表头 leaf 行（字段名行）高度；总高 = leaf + 当前列组深度 × groupHeaderRowHeight，随之重算。 */
  setHeaderHeight(headerHeight: number): void
  getRowsAxis(): ChunkedAxis
  getColsAxis(): ChunkedAxis
  getViewport(): Viewport
  getFrozenConfig(): FrozenConfig
}

export class DefaultLayoutState implements LayoutState {
  private theme: Theme
  private readonly explicitDefaultRowHeight: number | undefined
  private readonly excelHeaders: boolean
  private readonly getSchema: () => Schema
  private readonly getGroupHeaderDepth: () => number
  private readonly initialFrozenConfig: FrozenConfig
  private viewInitialized = false
  private rowsAxis!: ChunkedAxis
  private colsAxis!: ChunkedAxis
  private frozen!: FrozenRegions
  private viewport!: Viewport

  constructor(input: LayoutStateInput) {
    this.theme = input.theme
    this.explicitDefaultRowHeight = input.explicitDefaultRowHeight
    this.excelHeaders = input.excelHeaders
    this.getSchema = input.getSchema
    this.getGroupHeaderDepth = input.getGroupHeaderDepth
    const f = input.frozenInput ?? {}
    this.initialFrozenConfig = {
      topRows: f.topRows ?? 0,
      leftCols: f.leftCols ?? 0,
      rightCols: f.rightCols ?? 0,
    }
  }

  resolveDefaultRowHeight(): number {
    return this.explicitDefaultRowHeight ?? this.theme.metrics.rowHeight
  }

  averageColWidth(): number {
    const fields = this.getSchema().fields
    if (fields.length === 0) return 100
    const sum = fields.reduce((acc, field) => acc + field.width, 0)
    return Math.max(1, Math.round(sum / fields.length))
  }

  initView(rowsAxis: ChunkedAxis, colsAxis: ChunkedAxis): void {
    const config = this.viewInitialized ? this.frozen.getFrozenConfig() : this.initialFrozenConfig
    this.viewInitialized = true
    this.rowsAxis = rowsAxis
    this.colsAxis = colsAxis
    this.frozen = new FrozenRegions(rowsAxis, colsAxis, config)
    this.viewport = new Viewport(rowsAxis, colsAxis, this.frozen)
    this.applyHeaderHeights()
    this.applySheetChrome()
  }

  rebuildRows(rowsAxis: ChunkedAxis): void {
    this.rowsAxis = rowsAxis
    this.recreateViewportPreserving()
  }

  rebuildCols(colsAxis: ChunkedAxis): void {
    this.colsAxis = colsAxis
    this.recreateViewportPreserving()
  }

  applyTheme(theme: Theme): void {
    this.theme = theme
    this.applyHeaderHeights()
    this.applySheetChrome()
  }

  remapFrozenAfterColInsert(at: number, count: number, oldTotalCols: number): void {
    const cfg = this.frozen.getFrozenConfig()
    let { leftCols, rightCols } = cfg
    if (at < leftCols) leftCols += count
    if (rightCols > 0 && at >= oldTotalCols - rightCols) rightCols += count
    this.frozen.setFrozen({ topRows: cfg.topRows, leftCols, rightCols })
  }

  remapFrozenAfterColDelete(removedIndices: readonly number[], totalColsBefore: number): void {
    const cfg = this.frozen.getFrozenConfig()
    const leftHit = removedIndices.filter((idx) => idx < cfg.leftCols).length
    const rightBoundary = totalColsBefore - cfg.rightCols
    const rightHit = removedIndices.filter((idx) => idx >= rightBoundary).length
    this.frozen.setFrozen({
      topRows: cfg.topRows,
      leftCols: Math.max(0, cfg.leftCols - leftHit),
      rightCols: Math.max(0, cfg.rightCols - rightHit),
    })
  }

  setFrozenConfig(config: Partial<FrozenConfig>): void {
    this.frozen.setFrozen(config)
  }

  setViewportSize(width: number, height: number): void {
    this.viewport.setSize(width, height)
  }

  setScroll(logicalX: number, logicalY: number): void {
    this.viewport.setScroll(logicalX, logicalY)
  }

  setHeaderHeight(headerHeight: number): void {
    this.viewport.setHeaderHeights(this.computeTotalHeaderHeight(headerHeight), headerHeight)
  }

  /** 重建 frozen+viewport，保留当前 viewport 的 header/gutter/尺寸/滚动（mutation 路径用）。 */
  private recreateViewportPreserving(): void {
    const snap = this.viewport.snapshot()
    this.frozen = new FrozenRegions(this.rowsAxis, this.colsAxis, this.frozen.getFrozenConfig())
    this.viewport = new Viewport(this.rowsAxis, this.colsAxis, this.frozen)
    // leaf 高不随列结构 mutation 变化，可放心搬旧值；但总高必须按当前 depth 重算——
    // 直接搬 snap.headerHeight 会在列组深度已变化时留下过期总高（结构性正确性，
    // depth 目前恒为 0，Task 5 接入真实 ColumnGroupStore 后此路径开始生效）。
    this.viewport.setHeaderHeights(
      this.computeTotalHeaderHeight(snap.leafHeaderHeight),
      snap.leafHeaderHeight,
    )
    this.viewport.setRowHeaderWidth(snap.rowHeaderWidth)
    this.viewport.setSize(snap.contentRect.width, snap.contentRect.height)
    this.viewport.setScroll(snap.scrollX, snap.scrollY)
  }

  /** 按当前 theme.metrics.headerHeight（leaf）与列组深度重算并下发总高——initView/applyTheme 用。 */
  private applyHeaderHeights(): void {
    const leaf = this.theme.metrics.headerHeight
    this.viewport.setHeaderHeights(this.computeTotalHeaderHeight(leaf), leaf)
  }

  /** 总高 = leaf + 当前列组深度 × groupHeaderRowHeight；无列组（depth=0）时等于 leaf。 */
  private computeTotalHeaderHeight(leaf: number): number {
    return this.getGroupHeaderDepth() * this.theme.metrics.groupHeaderRowHeight + leaf
  }

  /** excel 风格 row header gutter（与抽离前 engine `applySheetChrome` 一致）。 */
  private applySheetChrome(): void {
    const gutter = this.excelHeaders
      ? Math.max(this.theme.metrics.rowHeaderWidth, DEFAULT_EXCEL_ROW_HEADER_WIDTH)
      : 0
    this.viewport.setRowHeaderWidth(gutter)
  }
  getRowsAxis(): ChunkedAxis {
    return this.rowsAxis
  }
  getColsAxis(): ChunkedAxis {
    return this.colsAxis
  }
  getViewport(): Viewport {
    return this.viewport
  }
  getFrozenConfig(): FrozenConfig {
    return this.frozen.getFrozenConfig()
  }
}
