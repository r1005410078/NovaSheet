import type { DataSource } from '../kernel/data/DataSource'
import type { CellValue, Field, FieldType } from '../kernel/data/Schema'
import type { ChunkedAxis } from '../kernel/geometry/ChunkedAxis'
import type { ViewportSnapshot } from '../kernel/geometry/Viewport'
import type { HoveredColumnHeaderMenu, RenderFrame, RenderFrameCollapsedColGap } from '../kernel/render/RenderFrame'
import type { Theme } from '../kernel/theme/Theme'
import type { CellEditSession } from '../kernel/render/RenderTypes'
import type { CellFormatter, ResolvedCellFormat, ValueFormat } from '../kernel/protocol/FormatTypes'
import type { VisibleFormatResolver } from '../features/format/VisibleFormatResolver'
import type { GridSelection } from '../kernel/coords/SelectionTypes'
import type { CollapsedGap } from '../kernel/render/RenderTypes'
import type { CellAttachmentStore } from '../features/attachment/CellAttachmentStore'
import { formatValue } from '../kernel/protocol/formatValue'

/** date 类型列在没有显式 valueFormat 时使用的默认显示 pattern。 */
const DEFAULT_DATE_PATTERN = 'YYYY-MM-DD'
const DEFAULT_DATE_FORMAT: ValueFormat = { kind: 'date', pattern: DEFAULT_DATE_PATTERN }

/**
 * 构 RenderFrame.formatCell 闭包。闭合可见区已解析的 cell 级 valueFormat（VIEW 坐标）
 * + 列默认（field.format）+ 注册表 + locale。无显式 format 的格返回 undefined。
 * date 类型列无显式 format 时注入默认 pattern，避免裸 serial 数字露出。
 */
export function buildFormatCell(
  cellFormats: readonly ResolvedCellFormat[],
  formatters: Readonly<Record<string, CellFormatter>>,
  locale: string,
  resolveCellType: (rowIndex: number, colIndex: number, field: Field) => FieldType,
): (rowIndex: number, colIndex: number, field: Field, value: CellValue) => string | undefined {
  const cellMap = new Map<string, ValueFormat>()
  for (const cf of cellFormats) {
    if (cf.format.valueFormat) cellMap.set(`${cf.rowIndex}:${cf.colIndex}`, cf.format.valueFormat)
  }
  return (rowIndex, colIndex, field, value) => {
    const explicit = cellMap.get(`${rowIndex}:${colIndex}`) ?? field.format
    const format = explicit ?? (resolveCellType(rowIndex, colIndex, field) === 'date' ? DEFAULT_DATE_FORMAT : undefined)
    if (!format) return undefined
    return formatValue(value, format, { field, locale }, formatters)
  }
}

/** `assembleRenderFrame` 的只读输入；与 `DefaultGridEngine.getFrame` 解耦。 */
export interface FrameAssemblerInput {
  readonly data: DataSource
  readonly theme: Theme
  readonly rowsAxis: ChunkedAxis
  readonly colsAxis: ChunkedAxis
  readonly viewport: ViewportSnapshot
  readonly selection: GridSelection
  readonly rowHeaderField?: string
  readonly rowHeaderCornerLabel?: string
  readonly cellEdit?: CellEditSession
  readonly allRowGaps: readonly CollapsedGap[]
  readonly allColGaps: readonly Omit<RenderFrameCollapsedColGap, 'xPx'>[]
  readonly frameFormat: VisibleFormatResolver
  readonly formatters: Readonly<Record<string, CellFormatter>>
  readonly locale: string
  /** view→raw 行坐标转换，用于构建 getAttachment 闭包。 */
  readonly viewRowToRaw: (viewRow: number) => number
  /** view→raw 列坐标转换，用于构建 getAttachment 闭包。 */
  readonly viewColToRaw: (viewCol: number) => number
  /** raw cell type resolver，构帧时包成 view resolver。 */
  readonly resolveRawCellType: (rowIndex: number, colIndex: number, field: Field) => FieldType
  /** raw cell 是否存在显式 type override，构帧时包成 view probe。 */
  readonly hasRawCellTypeOverride: (rowIndex: number, colIndex: number) => boolean
  /** 附件存储引用，供 getAttachment 读取。 */
  readonly attachmentStore: CellAttachmentStore
  /** raw cell 校验状态读取函数；未提供时 getValidationState 不加入 frame。 */
  readonly getRawValidationState?: (rawRow: number, rawCol: number) => 'ok' | 'invalid' | 'pending'
  /** 列头悬停菜单状态；undefined 表示无悬停。 */
  readonly hoveredColumnHeaderMenu?: HoveredColumnHeaderMenu
}

/** 从 layout/structure 快照装配不可变 `RenderFrame`（纯函数，无 engine 副作用）。 */
export function assembleRenderFrame(input: FrameAssemblerInput): RenderFrame {
  const { rowsAxis, colsAxis, viewport: vpSnap } = input
  const [firstVisible, lastVisible] = rowsAxis.getVisibleRange(
    vpSnap.scrollY,
    vpSnap.scrollY + vpSnap.contentRect.height,
  )
  const collapsedRowGaps = input.allRowGaps
    .filter((g) => g.atViewRow >= firstVisible && g.atViewRow <= lastVisible)
    .map((g) => ({
      ...g,
      yPx: rowsAxis.indexToPosition(g.atViewRow + 1) - vpSnap.scrollY,
    }))
  const [firstVisibleCol, lastVisibleCol] = colsAxis.getVisibleRange(
    vpSnap.scrollX,
    vpSnap.scrollX + vpSnap.contentRect.width,
  )
  const collapsedColGaps = input.allColGaps
    .filter((g) => g.atViewCol >= firstVisibleCol && g.atViewCol <= lastVisibleCol)
    .map((g) => ({
      ...g,
      xPx: colsAxis.indexToPosition(g.atViewCol + 1) - vpSnap.scrollX,
    }))
  const mergeRegions = input.frameFormat.mergeRegions(
    firstVisible,
    lastVisible,
    firstVisibleCol,
    lastVisibleCol,
  )
  const cellFormats = input.frameFormat.cellFormats(
    firstVisible,
    lastVisible,
    firstVisibleCol,
    lastVisibleCol,
    mergeRegions,
  )
  const resolveCellType = (viewRow: number, viewCol: number, field: Field): FieldType => {
    const rawRow = input.viewRowToRaw(viewRow)
    const rawCol = input.viewColToRaw(viewCol)
    return rawCol < 0 ? field.type : input.resolveRawCellType(rawRow, rawCol, field)
  }
  const hasCellTypeOverride = (viewRow: number, viewCol: number): boolean => {
    const rawRow = input.viewRowToRaw(viewRow)
    const rawCol = input.viewColToRaw(viewCol)
    return rawCol >= 0 && input.hasRawCellTypeOverride(rawRow, rawCol)
  }
  const formatCell = buildFormatCell(cellFormats, input.formatters, input.locale, resolveCellType)
  const { viewRowToRaw, viewColToRaw, attachmentStore } = input
  function getAttachment<T>(namespace: string, viewRow: number, viewCol: number): T | undefined {
    const rawRow = viewRowToRaw(viewRow)
    const rawCol = viewColToRaw(viewCol)
    return attachmentStore.get(namespace, rawRow, rawCol) as T | undefined
  }
  const getValidationState = input.getRawValidationState
    ? (viewRow: number, viewCol: number): 'ok' | 'invalid' | 'pending' => {
        const rawRow = input.viewRowToRaw(viewRow)
        const rawCol = input.viewColToRaw(viewCol)
        if (rawRow < 0 || rawCol < 0) return 'ok'
        return input.getRawValidationState!(rawRow, rawCol)
      }
    : undefined
  return {
    data: input.data,
    theme: input.theme,
    rowsAxis,
    colsAxis,
    viewport: vpSnap,
    selection: input.selection,
    rowHeaderField: input.rowHeaderField,
    rowHeaderCornerLabel: input.rowHeaderCornerLabel,
    cellEdit: input.cellEdit,
    collapsedRowGaps,
    collapsedColGaps,
    cellFormats,
    mergeRegions,
    formatCell,
    resolveCellType,
    hasCellTypeOverride,
    getAttachment,
    getValidationState,
    hoveredColumnHeaderMenu: input.hoveredColumnHeaderMenu,
  }
}
