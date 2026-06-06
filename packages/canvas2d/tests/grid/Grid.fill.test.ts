import { describe, expect, it, mock } from 'bun:test'
import { Grid } from '@novasheet/core'
import { canvas2dBackend } from '../../src/backend/canvas2dBackend'
import { InMemoryDataSource } from '@novasheet/core'

describe('Grid facade — fill event', () => {
  it('onFill returns an unsubscribe function', () => {
    const container = document.createElement('div')
    const grid = new Grid(container, {
      backend: canvas2dBackend,
      data: new InMemoryDataSource({
        schema: { fields: [{ id: 'a', name: 'A', type: 'text', width: 80 }] },
        rows: [{ a: 'x' }],
      }),
    })
    const off = grid.onFill(mock(() => {}))
    expect(typeof off).toBe('function')
    off()
    grid.destroy()
  })
})
