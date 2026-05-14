import { describe, expect, it } from 'vitest'
import { ChunkedAxis } from '../../src/layout/ChunkedAxis'
import { GridLinesPainter } from '../../src/render/GridLinesPainter'
import { denseGridTheme } from '../../src/theme/denseGridTheme'
import { createRecordingContext } from '../helpers/recording-context'

describe('GridLinesPainter', () => {
  it('emits moveTo/lineTo per row + col then a single stroke', () => {
    const { ctx, ops } = createRecordingContext()
    const rowsAxis = new ChunkedAxis({ count: 10, defaultSize: 28 })
    const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })
    const painter = new GridLinesPainter(denseGridTheme)
    painter.paint(ctx, {
      rowsAxis,
      colsAxis,
      rowRange: [0, 2],
      colRange: [0, 1],
      rect: { x: 0, y: 32, width: 200, height: 100 },
    })
    const strokeCount = ops.filter((o) => o.op === 'stroke').length
    expect(strokeCount).toBe(1)
    expect(ops.some((o) => o.op === 'set:strokeStyle' && o.value === denseGridTheme.colors.gridLine)).toBe(true)
    expect(ops.some((o) => o.op === 'moveTo')).toBe(true)
    expect(ops.some((o) => o.op === 'lineTo')).toBe(true)
  })

  it('skips drawing when range is empty', () => {
    const { ctx, ops } = createRecordingContext()
    const rowsAxis = new ChunkedAxis({ count: 0, defaultSize: 28 })
    const colsAxis = new ChunkedAxis({ count: 0, defaultSize: 100 })
    new GridLinesPainter(denseGridTheme).paint(ctx, {
      rowsAxis,
      colsAxis,
      rowRange: [0, -1],
      colRange: [0, -1],
      rect: { x: 0, y: 0, width: 200, height: 100 },
    })
    expect(ops.filter((o) => o.op === 'stroke')).toHaveLength(0)
  })
})
