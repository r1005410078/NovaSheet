import type { ChunkedAxis } from '../../layout/ChunkedAxis'
import { FrozenRegions } from '../../layout/FrozenRegions'
import type { FrozenConfig } from '../../layout/FrozenRegions'
import { Viewport } from '../../layout/Viewport'
import type { Theme } from '../../theme/Theme'
import type { Schema } from '../../data/Schema'

/** 构造 `DefaultLayoutState` 所需输入：theme/schema 派生，不含 axes（两阶段生命周期第一阶段）。 */
export interface LayoutStateInput {
  readonly theme: Theme
  readonly explicitDefaultRowHeight: number | undefined
  readonly excelHeaders: boolean
  readonly frozenInput: Partial<FrozenConfig> | undefined
  readonly getSchema: () => Schema
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

  // 以下视图方法在 Task 2 / Task 3 实现；本任务先抛错占位以保证类型完整、测试聚焦默认值。
  // Task 2 前这些字段只赋值不读取，通过此处统一引用确保 TS strict noUnusedLocals 通过。
  private _scaffoldRef(): never {
    void this.viewInitialized
    void this.excelHeaders
    void this.initialFrozenConfig
    throw new Error('not implemented')
  }

  initView(): void {
    this._scaffoldRef()
  }
  rebuildRows(): void {
    throw new Error('not implemented')
  }
  rebuildCols(): void {
    throw new Error('not implemented')
  }
  applyTheme(): void {
    throw new Error('not implemented')
  }
  remapFrozenAfterColInsert(): void {
    throw new Error('not implemented')
  }
  remapFrozenAfterColDelete(): void {
    throw new Error('not implemented')
  }
  setFrozenConfig(): void {
    throw new Error('not implemented')
  }
  setViewportSize(): void {
    throw new Error('not implemented')
  }
  setScroll(): void {
    throw new Error('not implemented')
  }
  setHeaderHeight(): void {
    throw new Error('not implemented')
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
