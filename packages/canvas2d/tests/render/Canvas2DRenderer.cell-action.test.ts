import { describe, expect, it } from 'bun:test'
import {
  ChunkedAxis,
  FrozenRegions,
  InMemoryDataSource,
  Viewport,
  denseGridTheme,
  type Schema,
} from '@zhiguang/core'
import { Canvas2DRenderer } from '../../src/render/Canvas2DRenderer'
import { createRecordingContext } from '../helpers/recording-context'

const SCHEMA: Schema = {
  fields: [{ id: 'owner', name: 'Owner', type: 'assignee', width: 160 }],
}

describe('Canvas2DRenderer — cell action hit zones', () => {
  it('custom renderer getActionZones contributes getCellActionAt hits', () => {
    const { ctx } = createRecordingContext()
    const data = new InMemoryDataSource({
      schema: SCHEMA,
      rows: [{ owner: 'Ada' }],
    })
    const rowsAxis = new ChunkedAxis({
      count: data.getRowCount(),
      defaultSize: denseGridTheme.metrics.rowHeight,
    })
    const colsAxis = new ChunkedAxis({ count: SCHEMA.fields.length, defaultSize: 160 })
    const frozen = new FrozenRegions(rowsAxis, colsAxis, {})
    const viewport = new Viewport(rowsAxis, colsAxis, frozen)
    viewport.setSize(400, 200)
    viewport.setHeaderHeight(denseGridTheme.metrics.headerHeight)
    viewport.setScroll(0, 0)
    const renderer = new Canvas2DRenderer({
      ctx,
      data,
      viewport,
      rowsAxis,
      colsAxis,
      theme: denseGridTheme,
      cellRenderers: {
        assignee: {
          paint: () => {},
          getActionZones: (params) => [
            {
              id: 'change-assignee',
              rect: {
                x: params.rect.x + 120,
                y: params.rect.y + 4,
                width: 24,
                height: 20,
              },
            },
          ],
        },
      },
    })

    renderer.paint()

    expect(renderer.getCellActionAt(132, 44)).toEqual({
      rowIndex: 0,
      colIndex: 0,
      actionId: 'change-assignee',
    })
    expect(renderer.getCellActionAt(20, 44)).toBeNull()
  })
})
