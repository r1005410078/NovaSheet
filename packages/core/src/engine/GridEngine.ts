/**
 * 平台无关引擎契约（spec §5 `GridEngine`）。
 *
 * 持有数据、主题、行列轴、冻结区、viewport 与逻辑滚动；不含 DOM / canvas。
 */

import type { DataSource } from '../data/DataSource'
import type { Axis } from '../layout/ChunkedAxis'
import type { FrozenConfig } from '../layout/FrozenRegions'
import type { Viewport } from '../layout/Viewport'
import type { RenderFrame } from '../render/RenderFrame'
import type { Theme } from '../theme/Theme'

/** `DefaultGridEngine` 构造参数。 */
export interface GridEngineOptions {
  data: DataSource
  theme?: Theme
  /** 推荐的新冻结配置：支持顶部、左侧、右侧冻结。 */
  frozen?: Partial<FrozenConfig>
  /** 兼容旧 API：等价于 `frozen.topRows`。新代码优先使用 `frozen`。 */
  frozenRows?: number
  /** 兼容旧 API：等价于 `frozen.leftCols`。新代码优先使用 `frozen`。 */
  frozenCols?: number
  defaultRowHeight?: number
}

export interface GridEngine {
  setData(data: DataSource): void
  setTheme(theme: Theme): void
  setFrozen(config: Partial<FrozenConfig>): void
  setFrozen(rows: number, cols: number): void
  setViewportSize(width: number, height: number): void
  setHeaderHeight(headerHeight: number): void
  setScroll(logicalX: number, logicalY: number): void
  setRowHeight(rowIndex: number, height: number): void
  setColumnWidth(fieldId: string, width: number): void
  getFrame(): RenderFrame
  getRowsTotalSize(): number
  getColsTotalSize(): number
  getColumnIndex(fieldId: string): number
  getTheme(): Theme
  getRowsAxis(): Axis
  getColsAxis(): Axis
  getViewport(): Viewport
  getData(): DataSource
}
