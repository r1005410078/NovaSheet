/**
 * 引擎状态快照，供 Web 渲染器消费（spec §5 `RenderFrame`）。
 *
 * 不是 renderer 无关的绘制指令流——各 renderer 仍需自行遍历可见单元格。
 * 作用是把 DOM/Canvas 类型挡在 core 之外，并统一每帧输入形状。
 */

import type { DataSource } from '../data/DataSource'
import type { CellValue, Field, FieldType } from '../data/Schema'
import type { GridSelection } from '../coords/SelectionTypes'
import type { MergeRegion } from '../coords/MergeRegion'
import type { Axis } from '../geometry/ChunkedAxis'
import type { ViewportSnapshot } from '../geometry/Viewport'
import type { Theme } from '../theme/Theme'
import type { ResolvedCellFormat } from '../protocol/FormatTypes'
import type { CellEditSession, CollapsedGap, HeaderDecorationSource } from './RenderTypes'

/**
 * Phase 4.5 — `RenderFrame` 中的折叠行间隙，扩展 `CollapsedGap` 加入像素坐标。
 * `yPx` 为间隙下边界相对于 canvas 顶部的像素偏移（= view-row `atViewRow` 的底边 − scrollY）。
 */
export interface HoveredColumnHeaderMenu {
  readonly colIndex: number
  /** 鼠标是否正悬在按钮圆形区域上（控制圆形背景是否渲染） */
  readonly buttonHovered: boolean
}

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
  viewPipeline?: HeaderDecorationSource
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
  /**
   * Phase 5-C — 值格式化解析器闭包。返回 `undefined` 表示该格无显式 valueFormat，
   * painter 应回退默认显示路径。引擎构帧时闭合 cell 级 valueFormat + 列默认 + 注册表 + locale。
   */
  formatCell?: (rowIndex: number, colIndex: number, field: Field, value: CellValue) => string | undefined
  /** 当前格 resolved cell type 解析器（view 坐标）。 */
  resolveCellType?: (rowIndex: number, colIndex: number, field: Field) => FieldType
  /** 当前格是否存在显式 cell type override（view 坐标）。 */
  hasCellTypeOverride?: (rowIndex: number, colIndex: number) => boolean
  /**
   * Phase A — 附件读取闭包（view 坐标）。引擎构帧时闭合 coords view→raw 转换 + attachmentStore。
   * `viewRow`/`viewCol` 为 view 空间坐标（渲染时已知），返回 `undefined` 表示该格无此 namespace 数据。
   */
  getAttachment?: <T>(namespace: string, viewRow: number, viewCol: number) => T | undefined
  /**
   * Validation — 单格校验状态查询闭包（view 坐标）；null/'ok' 均表示无错误，'invalid' = 需绘制错误指示器。
   * 引擎构帧时已闭合 raw→view 坐标转换与 resultStore 访问。
   */
  getValidationState?: (rowIndex: number, colIndex: number) => 'ok' | 'invalid' | 'pending'
  /** 列头悬停菜单状态：指示哪列的列头菜单按钮当前应高亮显示。 */
  hoveredColumnHeaderMenu?: HoveredColumnHeaderMenu
}
