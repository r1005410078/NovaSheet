/**
 * 引擎状态快照，供 Web 渲染器消费（spec §5 `RenderFrame`）。
 *
 * 不是 renderer 无关的绘制指令流——各 renderer 仍需自行遍历可见单元格。
 * 作用是把 DOM/Canvas 类型挡在 core 之外，并统一每帧输入形状。
 */

import type { DataSource } from '../data/DataSource'
import type { ResolvedCellFormat } from '../format/CellFormat'
import type { MergeRegion } from '../merge/MergeStore'
import type { CellEditSession } from '../interaction/CellEditModel'
import type { GridSelection } from '../engine/selection/SelectionTypes'
import type { Axis } from '../layout/ChunkedAxis'
import type { ViewportSnapshot } from '../layout/Viewport'
import type { Theme } from '../theme/Theme'
import type { CollapsedGap } from '../view/HideRowsLayer'
import type { ViewPipeline } from '../view/ViewPipeline'

/**
 * Phase 4.5 — `RenderFrame` 中的折叠行间隙，扩展 `CollapsedGap` 加入像素坐标。
 * `yPx` 为间隙下边界相对于 canvas 顶部的像素偏移（= view-row `atViewRow` 的底边 − scrollY）。
 */
export interface RenderFrameCollapsedGap extends CollapsedGap {
  readonly yPx: number
}

export interface RenderFrameCollapsedColGap {
  readonly atViewCol: number
  readonly hiddenCount: number
  readonly hiddenFieldIds: readonly string[]
  readonly xPx: number
}

export interface RenderFrame {
  data: DataSource
  theme: Theme
  rowsAxis: Axis
  colsAxis: Axis
  viewport: ViewportSnapshot
  selection?: GridSelection
  /** Phase 4.4 — view 管线提供列头排序/筛选装饰。 */
  viewPipeline?: Pick<ViewPipeline, 'collectHeaderDecorations'>
  /** Phase 3.5 — 正在编辑的单元格（若有）。 */
  cellEdit?: CellEditSession
  /** Phase 4.5 — 当前可见区域内的折叠行间隙列表（含像素坐标）。 */
  collapsedRowGaps: readonly RenderFrameCollapsedGap[]
  /** Phase 4.6 — 当前可见区域内的折叠列间隙列表（含像素坐标）。 */
  collapsedColGaps: readonly RenderFrameCollapsedColGap[]
  /**
   * Phase 5-A — 当前可见区域内已解析的单元格格式（填充色 / 边框），坐标为 **view 空间**。
   * 引擎构帧时已把 raw store 翻译为 view 坐标，painter 无需再翻译。可选，缺省按 `?? []` 读取。
   */
  cellFormats?: readonly ResolvedCellFormat[]
  /**
   * Phase 5-A — 当前可见区域内相交的合并区域，坐标为 **view 空间**。
   * 引擎构帧时已把 raw store 翻译为 view 坐标，painter 无需再翻译。可选，缺省按 `?? []` 读取。
   */
  mergeRegions?: readonly MergeRegion[]
}
