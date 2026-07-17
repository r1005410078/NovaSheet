import { describe, expect, it } from 'bun:test'
import { createSnapshotWindowedProvider } from '../../../../src/kernel/data/windowed/createSnapshotWindowedProvider'
import type { Schema } from '../../../../src/kernel/data/Schema'
import type { WindowedDataEvent } from '../../../../src/ports/WindowedDataProvider'

const schema: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 100 },
    { id: 'score', name: 'Score', type: 'number', width: 80 },
  ],
}

describe('createSnapshotWindowedProvider', () => {
  it('loadRange only materializes the requested window', async () => {
    const provider = createSnapshotWindowedProvider({
      schema,
      rowCount: 100,
      getCell: (row, fieldId) => (fieldId === 'name' ? `n${row}` : row),
    })

    const slice = await provider.loadRange(
      { startRow: 5, endRow: 6, startCol: 0, endCol: 1 },
      new AbortController().signal,
    )

    expect(slice.rowCount).toBe(100)
    expect(slice.rows).toEqual([
      { name: 'n5', score: 5 },
      { name: 'n6', score: 6 },
    ])
  })

  it('replaceSnapshot emits cells for the current subscribe window (not resync)', () => {
    const events: WindowedDataEvent[] = []
    const provider = createSnapshotWindowedProvider({
      schema,
      rowCount: 10,
      getCell: () => 0,
    })
    const sub = provider.subscribe((e) => events.push(e))
    sub.setWindow({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 })

    provider.replaceSnapshot((_row, fieldId) => (fieldId === 'name' ? 'x' : 9))

    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      type: 'cells',
      updates: [
        { row: 0, fieldId: 'name', value: 'x' },
        { row: 0, fieldId: 'score', value: 9 },
      ],
    })
  })

  it('reconnect emits resync; invalidate emits invalidate', () => {
    const events: WindowedDataEvent[] = []
    const provider = createSnapshotWindowedProvider({
      schema,
      rowCount: 10,
      getCell: () => 1,
    })
    provider.subscribe((e) => events.push(e))

    provider.invalidate()
    provider.reconnect(20)

    expect(events).toEqual([{ type: 'invalidate' }, { type: 'resync', rowCount: 20 }])
    expect(provider.getRowCount()).toBe(20)
  })
})
