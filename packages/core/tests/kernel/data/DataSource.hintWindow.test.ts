import { describe, expect, it } from 'bun:test'
import type { DataSource, DataWindow } from '../../../src/kernel/data/DataSource'
import type { WindowedDataProvider } from '../../../src/kernel/data/windowed/WindowedDataProvider'

describe('DataSource.hintWindow seam', () => {
  it('DataSource remains satisfied by implementations without hintWindow', () => {
    const source: DataSource = {
      getRowCount: () => 0,
      getSchema: () => ({ fields: [] }),
      getRows: () => [],
      getCell: () => undefined,
      subscribe: () => () => {},
    }
    expect(source.hintWindow).toBeUndefined()
  })

  it('hintWindow is callable with an inclusive DataWindow when implemented', () => {
    const calls: DataWindow[] = []
    const source: DataSource = {
      getRowCount: () => 0,
      getSchema: () => ({ fields: [] }),
      getRows: () => [],
      getCell: () => undefined,
      subscribe: () => () => {},
      hintWindow: (window) => calls.push(window),
    }
    const window: DataWindow = { startRow: 0, endRow: 39, startCol: 0, endCol: 1 }
    source.hintWindow?.(window)
    expect(calls).toEqual([window])
  })

  it('WindowedDataProvider shape is importable and constructible', () => {
    const provider: WindowedDataProvider = {
      loadRange: async (_window) => ({ rows: [] }),
      subscribe: (onEvent) => {
        onEvent({ type: 'resync' })
        return { setWindow: () => {}, close: () => {} }
      },
    }
    expect(typeof provider.loadRange).toBe('function')
  })
})
