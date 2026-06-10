import { describe, expect, it } from 'bun:test'
import { assembleRenderFrame, buildFormatCell } from '../../src/engine/FrameAssembler'
import type { FrameAssemblerInput } from '../../src/engine/FrameAssembler'
import type { ResolvedCellFormat } from '../../src/kernel/protocol/FormatTypes'
import type { Field } from '../../src/kernel/data/Schema'
import { VisibleFormatResolver } from '../../src/features/format/VisibleFormatResolver'
import { DefaultFormatState } from '../../src/features/format/FormatState'
import { CoordinateSpace } from '../../src/kernel/coords/CoordinateSpace'
import { InMemoryDataSource } from '../../src/kernel/data/InMemoryDataSource'
import { denseGridTheme } from '../../src/kernel/theme/denseGridTheme'
import type { ChunkedAxis } from '../../src/kernel/geometry/ChunkedAxis'
import type { ViewportSnapshot } from '../../src/kernel/geometry/Viewport'

const schema = {
  fields: [{ id: 'a', name: 'A', type: 'text' as const, width: 80 }],
}

const numField: Field = { id: 'a', name: 'A', type: 'number', width: 100 }

describe('buildFormatCell', () => {
  it('cell 级 valueFormat 覆盖列默认', () => {
    const cellFormats: ResolvedCellFormat[] = [
      { rowIndex: 0, colIndex: 0, format: { valueFormat: { kind: 'currency', currency: 'CNY' } } },
    ]
    const field: Field = { ...numField, format: { kind: 'number' } }
    const fc = buildFormatCell(cellFormats, {}, 'en-US')
    expect(fc(0, 0, field, 1234.5)).toBe('CN¥1,234.50')   // cell 级 currency 胜
    expect(fc(1, 0, field, 1234)).toBe('1,234')          // 无 cell 级 → 列默认 number
  })
  it('无任何 format → undefined', () => {
    const fc = buildFormatCell([], {}, 'en-US')
    expect(fc(0, 0, numField, 5)).toBeUndefined()
  })
})

function mockAxis(visible: [number, number], positionAt: (i: number) => number): ChunkedAxis {
  return {
    getVisibleRange: () => visible,
    indexToPosition: positionAt,
  } as unknown as ChunkedAxis
}

describe('assembleRenderFrame', () => {
  it('可见区 row gap 计算 yPx = indexToPosition(atViewRow+1) - scrollY', () => {
    const data = new InMemoryDataSource({ schema, rows: [{ a: 'x' }, { a: 'y' }, { a: 'z' }] })
    const formatState = new DefaultFormatState()
    const coords = new CoordinateSpace({
      getViewData: () => data,
      getRawSchema: () => schema,
      isColHidden: () => false,
    })
    const frameFormat = new VisibleFormatResolver(
      formatState.formatStore,
      formatState.mergeStore,
      coords,
    )
    const viewport: ViewportSnapshot = {
      regions: [],
      scrollX: 0,
      scrollY: 10,
      contentRect: { width: 200, height: 200 },
      headerHeight: 32,
      rowHeaderWidth: 48,
      version: 0,
    }
    const input: FrameAssemblerInput = {
      data,
      theme: denseGridTheme,
      rowsAxis: mockAxis([0, 2], (i) => i * 24),
      colsAxis: mockAxis([0, 0], (i) => i * 80),
      viewport,
      selection: {
        activeCell: { rowIndex: 0, colIndex: 0 },
        anchorCell: { rowIndex: 0, colIndex: 0 },
        extentCell: { rowIndex: 0, colIndex: 0 },
        selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
      },
      allRowGaps: [{ atViewRow: 1, hiddenCount: 2, hiddenIds: [5, 6] }],
      allColGaps: [],
      frameFormat,
      formatters: {},
      locale: 'en-US',
    }
    const frame = assembleRenderFrame(input)
    expect(frame.collapsedRowGaps).toHaveLength(1)
    expect(frame.collapsedRowGaps[0]!.yPx).toBe(24 * 2 - 10)
  })
})
