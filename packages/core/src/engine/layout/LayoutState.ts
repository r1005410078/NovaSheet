import type { DataSource } from '../../data/DataSource'
import type { ChunkedAxis } from '../../layout/ChunkedAxis'
import type { FrozenConfig, FrozenRegions } from '../../layout/FrozenRegions'
import type { Viewport, ViewportSnapshot } from '../../layout/Viewport'
import type { Theme } from '../../theme/Theme'

/** Layout 领域创建或重建后的 engine-owned 状态。 */
export interface LayoutState {
  readonly rowsAxis: ChunkedAxis
  readonly colsAxis: ChunkedAxis
  readonly frozen: FrozenRegions
  readonly viewport: Viewport
}

/** 构建 layout state 所需的最小输入。 */
export interface LayoutStateInput {
  readonly data: DataSource
  readonly theme: Theme
  readonly rawRowsAxis: ChunkedAxis
  readonly rawColsAxis: ChunkedAxis
  readonly hiddenFieldIds: ReadonlySet<string>
  readonly frozenConfig: FrozenConfig
  readonly previousViewport?: ViewportSnapshot
  readonly excelHeaders: boolean
}

