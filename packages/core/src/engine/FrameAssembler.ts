import type { DataSource } from '../kernel/data/DataSource'
import type { ChunkedAxis } from '../kernel/geometry/ChunkedAxis'
import type { ViewportSnapshot } from '../kernel/geometry/Viewport'
import type { RenderFrame, RenderFrameCollapsedColGap } from '../kernel/render/RenderFrame'
import type { Theme } from '../kernel/theme/Theme'
import type { CellEditSession } from '../features/edit/CellEditModel'
import type { VisibleFormatResolver } from '../features/format/VisibleFormatResolver'
import type { GridSelection } from '../features/selection/SelectionTypes'
import type { CollapsedGap } from '../features/view/HideRowsLayer'

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
  }
}
