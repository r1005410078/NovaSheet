import type { DataSource, FrozenConfig, GridEngineOptions, Theme } from '@novasheet/core'

/** Grid.autofitRows 入参。`rows` 缺省 = 全表。 */
export interface AutofitRowsOptions {
  /** 仅 autofit 指定行；缺省 = 全部 */
  rows?: readonly number[]
  /** 行高下限（CSS px），缺省 = theme.metrics.rowHeight */
  minHeight?: number
  /** 行高上限（CSS px），缺省 1200 */
  maxHeight?: number
}

/** Grid.autofitRows 结果。 */
export interface AutofitRowsResult {
  changedRows: number
  skippedRows: number
}

/**
 * 渲染后端对内契约（Canvas2D / 未来 WebGL 等）。
 *
 * `Grid` 门面只依赖本接口，不把 Canvas2D 装配细节暴露给调用方。
 * 新增后端时实现此接口，并在 `Grid` 构造函数的 `switch (renderer)` 中注册。
 */
export interface GridController {
  setData(data: DataSource): void
  setTheme(theme: Theme): void
  setRowHeight(rowIndex: number, height: number): void
  setColumnWidth(fieldId: string, width: number): void
  setFrozen(config: Partial<FrozenConfig>): void
  setFrozen(rows: number, cols: number): void
  refresh(): void
  scrollToRow(rowIndex: number, align?: 'start' | 'center' | 'end'): void
  scrollToCell(rowIndex: number, fieldId: string): void
  /**
   * 按当前列宽和文本内容批量重算 `field.wrap === true` 字段的行高（M3 autofit）。
   * 手动触发；后续若改了列宽 / 数据 / 主题需要再次调用。
   */
  autofitRows(options?: AutofitRowsOptions): AutofitRowsResult
  setClipboardReady(ready: boolean): void
  openContextMenuAt(rowIndex: number, fieldId: string): void
  closeContextMenu(): void
  destroy(): void
  /** @internal ResizeObserver 集成测试入口 */
  _onContainerResize(): void
}

export type { GridEngineOptions }
