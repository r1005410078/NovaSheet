import type { DataSource } from '../kernel/data/DataSource'
import type { CellValue, Field } from '../kernel/data/Schema'
import type { ChunkedAxis } from '../kernel/geometry/ChunkedAxis'
import type { ViewportSnapshot } from '../kernel/geometry/Viewport'
import type { RenderFrame, RenderFrameCollapsedColGap } from '../kernel/render/RenderFrame'
import type { Theme } from '../kernel/theme/Theme'
import type { CellTypeOverride } from '../kernel/protocol/CellTypeTypes'
import type { CellEditSession } from '../kernel/render/RenderTypes'
import type { CellFormatter, ResolvedCellFormat, ValueFormat } from '../kernel/protocol/FormatTypes'
import type { VisibleFormatResolver } from '../features/format/VisibleFormatResolver'
import type { GridSelection } from '../kernel/coords/SelectionTypes'
import type { CollapsedGap } from '../kernel/render/RenderTypes'
import type { CellAttachmentStore } from '../features/attachment/CellAttachmentStore'
import { normalizeFieldType } from '../features/cell-types'
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
  resolveCellType: (rowIndex: number, colIndex: number, field: Field) => CellTypeOverride,
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
  readonly resolveRawCellType: (rowIndex: number, colIndex: number, field: Field) => CellTypeOverride
  /** 附件存储引用，供 getAttachment 读取。 */
  readonly attachmentStore: CellAttachmentStore
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
  const resolveCellType = (viewRow: number, viewCol: number, field: Field): CellTypeOverride => {
    const rawRow = input.viewRowToRaw(viewRow)
    const rawCol = input.viewColToRaw(viewCol)
    return rawCol < 0 ? normalizeFieldType(field.type) : input.resolveRawCellType(rawRow, rawCol, field)
  }
  const formatCell = buildFormatCell(cellFormats, input.formatters, input.locale, resolveCellType)
  const { viewRowToRaw, viewColToRaw, attachmentStore } = input
  function getAttachment<T>(namespace: string, viewRow: number, viewCol: number): T | undefined {
    const rawRow = viewRowToRaw(viewRow)
    const rawCol = viewColToRaw(viewCol)
    return attachmentStore.get(namespace, rawRow, rawCol) as T | undefined
  }
  return {
    data: input.data,
    theme: input.theme,
    rowsAxis,
    colsAxis,
    viewport: vpSnap,
    selection: input.selection,
    cellEdit: input.cellEdit,
    collapsedRowGaps,
    collapsedColGaps,
    cellFormats,
    mergeRegions,
    formatCell,
    resolveCellType,
    getAttachment,
  }
}
