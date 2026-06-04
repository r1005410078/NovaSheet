import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../../src/data/InMemoryDataSource'
import { DefaultColumnStructure } from '../../../src/engine/column/DefaultColumnStructure'
import type { DataSource } from '../../../src/data/DataSource'

const DEFAULT_WIDTH = 80

function makeData(fieldIds: string[]): InMemoryDataSource {
  return new InMemoryDataSource({
    schema: { fields: fieldIds.map((id) => ({ id, name: id, type: 'text', width: DEFAULT_WIDTH })) },
    rows: [Object.fromEntries(fieldIds.map((id) => [id, `${id}0`]))],
  })
}

function makeCols(data: DataSource): DefaultColumnStructure {
  return new DefaultColumnStructure(data, () => DEFAULT_WIDTH)
}

describe('DefaultColumnStructure（自持状态）', () => {
  it('inserts columns and expands the raw col axis', () => {
    const data = makeData(['a', 'b'])
    const cols = makeCols(data)
    const event = cols.insertCols({ kind: 'insertCols', beforeFieldIndex: 1, count: 2 })
    expect(event?.kind).toBe('columnsInserted')
    expect(event?.at).toBe(1)
    expect(event?.count).toBe(2)
    expect(data.getSchema().fields.length).toBe(4)
    expect(cols.getViewColsAxis().getCount()).toBe(4)
  })

  it('deletes columns, captures removedIndices / widths / snapshots', () => {
    const data = makeData(['a', 'b', 'c'])
    const cols = makeCols(data)
    cols.setColWidthById('b', 120)
    const event = cols.deleteCols({ kind: 'deleteCols', fieldIds: ['b'] })
    expect(event?.removedIndices).toEqual([1])
    expect(event?.deletedWidths).toEqual([120])
    expect(event?.snapshots.length).toBe(1)
    expect(data.getSchema().fields.map((f) => f.id)).toEqual(['a', 'c'])
  })

  it('hides / unhides only effective field ids, reflected in view data + axis', () => {
    const data = makeData(['a', 'b', 'c'])
    const cols = makeCols(data)
    expect(cols.hideCols({ kind: 'hideCols', fieldIds: ['b', 'zzz'] })).toEqual({
      kind: 'columnsHidden',
      fieldIds: ['b'],
    })
    expect(cols.getHiddenCols()).toEqual(['b'])
    expect(cols.isColHidden('b')).toBe(true)
    expect(cols.getViewColsAxis().getCount()).toBe(2)
    expect(cols.getColViewData(data).getSchema().fields.map((f) => f.id)).toEqual(['a', 'c'])
    expect(cols.unhideCols({ kind: 'unhideCols', fieldIds: ['b'] })?.fieldIds).toEqual(['b'])
    expect(cols.getHiddenCols()).toEqual([])
  })

  it('moves columns, anchoring widths and producing a colIndexMap', () => {
    const data = makeData(['a', 'b', 'c', 'd'])
    const cols = makeCols(data)
    cols.setColWidthById('b', 120)
    const event = cols.moveCols({ kind: 'moveCols', fieldIds: ['b', 'c'], beforeFieldId: null })
    expect(event?.kind).toBe('columnsMoved')
    expect(data.getSchema().fields.map((f) => f.id)).toEqual(['a', 'd', 'b', 'c'])
    // b 现在在 raw index 2，宽度仍 120
    expect(cols.getColWidth(2)).toBe(120)
    expect(event?.indexMap.get(1)).toBe(2) // b: 1→2
  })

  it('returns null for invalid move / non-mutable source', () => {
    const data = makeData(['a', 'b', 'c'])
    const cols = makeCols(data)
    expect(cols.moveCols({ kind: 'moveCols', fieldIds: ['a', 'c'], beforeFieldId: null })).toBeNull()
    const immutable: DataSource = {
      getRowCount: () => 1,
      getSchema: () => ({ fields: [{ id: 'a', name: 'a', type: 'text', width: 80 }] }),
      getRows: () => [],
      getCell: () => undefined,
      subscribe: () => () => undefined,
    }
    const cols2 = new DefaultColumnStructure(immutable, () => DEFAULT_WIDTH)
    expect(cols2.insertCols({ kind: 'insertCols', beforeFieldIndex: 0, count: 1 })).toBeNull()
  })

  it('getCollapsedColGaps reports hidden runs', () => {
    const data = makeData(['a', 'b', 'c', 'd'])
    const cols = makeCols(data)
    cols.addHidden(['b', 'c'])
    expect(cols.getCollapsedColGaps()).toEqual([
      { atViewCol: 0, hiddenCount: 2, hiddenFieldIds: ['b', 'c'] },
    ])
    // 注：getCollapsedColGaps 产出不含 xPx（Omit<…,'xPx'>），由 engine getFrame 补 xPx
  })

  it('reinsertDeletedCols restores fields, widths and cells (delete undo)', () => {
    const data = makeData(['a', 'b', 'c'])
    const cols = makeCols(data)
    cols.setColWidthById('b', 120)
    const event = cols.deleteCols({ kind: 'deleteCols', fieldIds: ['b'] })!
    cols.reinsertDeletedCols(event.snapshots, event.deletedWidths)
    expect(data.getSchema().fields.map((f) => f.id)).toEqual(['a', 'b', 'c'])
    expect(cols.getColWidth(1)).toBe(120)
  })

  it('rebuild rebinds data source and reseeds the axis; clearHidden empties hidden', () => {
    const cols = makeCols(makeData(['a', 'b']))
    cols.addHidden(['a'])
    cols.clearHidden()
    expect(cols.getHiddenCols()).toEqual([])
    const next = makeData(['x', 'y', 'z'])
    cols.rebuild(next, () => DEFAULT_WIDTH)
    expect(cols.getViewColsAxis().getCount()).toBe(3)
  })
})
