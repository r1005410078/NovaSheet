import type { DataSource } from '../data/DataSource'
import type { ResolvedCellFormat } from '../format/CellFormat'
import type { CellEditSession } from '../interaction/CellEditModel'
import type { GridSelection } from '../interaction/SelectionModel'
import type { Axis } from '../layout/ChunkedAxis'
import type { ViewportSnapshot } from '../layout/Viewport'
import type { MergeRegion } from '../merge/MergeStore'
import type {
  RenderFrame,
  RenderFrameCollapsedColGap,
  RenderFrameCollapsedGap,
} from '../render/RenderFrame'
import type { Theme } from '../theme/Theme'
import type { CollapsedGap } from '../view/HideRowsLayer'

export interface FrameFormatResolver {
  mergeRegions(
    firstRow: number,
    lastRow: number,
    firstCol: number,
    lastCol: number,
  ): readonly MergeRegion[]
  cellFormats(
    firstRow: number,
    lastRow: number,
    firstCol: number,
    lastCol: number,
    mergeRegions: readonly MergeRegion[],
  ): readonly ResolvedCellFormat[]
}

export interface FrameBuilderParams {
  data: DataSource
  theme: Theme
  rowsAxis: Axis
  colsAxis: Axis
  viewport: ViewportSnapshot
  selection: GridSelection
  cellEdit: CellEditSession | undefined
  collapsedRowGaps: readonly CollapsedGap[]
  collapsedColGaps: readonly Omit<RenderFrameCollapsedColGap, 'xPx'>[]
  formatResolver: FrameFormatResolver
}

/** Builds a read-only RenderFrame from already-owned engine state. */
export class FrameBuilder {
  build(params: FrameBuilderParams): RenderFrame {
    const { viewport, rowsAxis, colsAxis } = params
    const [firstVisible, lastVisible] = rowsAxis.getVisibleRange(
      viewport.scrollY,
      viewport.scrollY + viewport.contentRect.height,
    )
    const [firstVisibleCol, lastVisibleCol] = colsAxis.getVisibleRange(
      viewport.scrollX,
      viewport.scrollX + viewport.contentRect.width,
    )
    const mergeRegions = params.formatResolver.mergeRegions(
      firstVisible,
      lastVisible,
      firstVisibleCol,
      lastVisibleCol,
    )
    const cellFormats = params.formatResolver.cellFormats(
      firstVisible,
      lastVisible,
      firstVisibleCol,
      lastVisibleCol,
      mergeRegions,
    )

    return {
      data: params.data,
      theme: params.theme,
      rowsAxis,
      colsAxis,
      viewport,
      selection: params.selection,
      cellEdit: params.cellEdit,
      collapsedRowGaps: projectRowGaps(
        params.collapsedRowGaps,
        rowsAxis,
        firstVisible,
        lastVisible,
        viewport.scrollY,
      ),
      collapsedColGaps: projectColGaps(
        params.collapsedColGaps,
        colsAxis,
        firstVisibleCol,
        lastVisibleCol,
        viewport.scrollX,
      ),
      cellFormats,
      mergeRegions,
    }
  }
}

function projectRowGaps(
  gaps: readonly CollapsedGap[],
  rowsAxis: Axis,
  firstVisible: number,
  lastVisible: number,
  scrollY: number,
): readonly RenderFrameCollapsedGap[] {
  return gaps
    .filter((gap) => gap.atViewRow >= firstVisible && gap.atViewRow <= lastVisible)
    .map((gap) => ({
      ...gap,
      yPx: rowsAxis.indexToPosition(gap.atViewRow + 1) - scrollY,
    }))
}

function projectColGaps(
  gaps: readonly Omit<RenderFrameCollapsedColGap, 'xPx'>[],
  colsAxis: Axis,
  firstVisibleCol: number,
  lastVisibleCol: number,
  scrollX: number,
): readonly RenderFrameCollapsedColGap[] {
  return gaps
    .filter((gap) => gap.atViewCol >= firstVisibleCol && gap.atViewCol <= lastVisibleCol)
    .map((gap) => ({
      ...gap,
      xPx: colsAxis.indexToPosition(gap.atViewCol + 1) - scrollX,
    }))
}
