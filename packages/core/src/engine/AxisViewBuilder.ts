import type { Field } from '../data/Schema'
import { ChunkedAxis, type Axis } from '../layout/ChunkedAxis'

export interface BuildRowsAxisParams {
  rawRowsAxis: Axis
  visibleRows: readonly number[]
  defaultSize: number
}

export interface BuildColsAxisParams {
  rawColsAxis: Axis
  fields: readonly Field[]
  hiddenFieldIds: ReadonlySet<string>
}

/** Builds view-space axes from raw axes plus visibility mappings. */
export class AxisViewBuilder {
  buildRowsAxis(params: BuildRowsAxisParams): ChunkedAxis {
    const { rawRowsAxis, visibleRows, defaultSize } = params
    const viewAxis = new ChunkedAxis({ count: visibleRows.length, defaultSize })
    for (let viewRow = 0; viewRow < visibleRows.length; viewRow += 1) {
      const underlyingRow = visibleRows[viewRow]!
      const size = rawRowsAxis.getSize(underlyingRow)
      if (size !== defaultSize) viewAxis.setSize(viewRow, size)
    }
    return viewAxis
  }

  buildColsAxis(params: BuildColsAxisParams): ChunkedAxis {
    const { rawColsAxis, fields, hiddenFieldIds } = params
    const visibleIndices: number[] = []
    for (let i = 0; i < fields.length; i += 1) {
      if (!hiddenFieldIds.has(fields[i]!.id)) visibleIndices.push(i)
    }

    const defaultSize = rawColsAxis.getDefaultSize()
    const viewAxis = new ChunkedAxis({ count: visibleIndices.length, defaultSize })
    for (let viewCol = 0; viewCol < visibleIndices.length; viewCol += 1) {
      const rawCol = visibleIndices[viewCol]!
      const size = rawColsAxis.getSize(rawCol)
      if (size !== defaultSize) viewAxis.setSize(viewCol, size)
    }
    return viewAxis
  }
}
