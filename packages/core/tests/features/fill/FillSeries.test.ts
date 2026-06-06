import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../../src/kernel/data/InMemoryDataSource'
import { computeFillWrites } from '../../../src/features/fill/FillSeries'
import type { Schema } from '../../../src/kernel/data/Schema'
import type { CellRange } from '../../../src/kernel/coords/SelectionTypes'

const schema: Schema = {
  fields: [
    { id: 'label', name: 'Label', type: 'text', width: 120 },
    { id: 'num', name: 'Number', type: 'number', width: 80 },
    { id: 'date', name: 'Date', type: 'date', width: 120 },
    { id: 'flag', name: 'Flag', type: 'checkbox', width: 80 },
  ],
}

function data(rows: Record<string, unknown>[]) {
  return new InMemoryDataSource({ schema, rows: rows as never })
}

describe('computeFillWrites', () => {
  it('copies a single source value downward', () => {
    const writes = computeFillWrites({
      data: data([{ label: 'A' }, {}, {}]),
      source: r(0, 0, 0, 0),
      fill: r(1, 2, 0, 0),
      direction: 'down',
    })
    expect(writes.map((w) => w.value)).toEqual(['A', 'A'])
  })

  it('extends number series downward and upward', () => {
    const down = computeFillWrites({
      data: data([{ num: 2 }, { num: 5 }, {}, {}]),
      source: r(0, 1, 1, 1),
      fill: r(2, 3, 1, 1),
      direction: 'down',
    })
    expect(down.map((w) => w.value)).toEqual([8, 11])

    const up = computeFillWrites({
      data: data([{}, {}, { num: 10 }, { num: 13 }]),
      source: r(2, 3, 1, 1),
      fill: r(0, 1, 1, 1),
      direction: 'up',
    })
    expect(up.map((w) => w.value)).toEqual([4, 7])
  })

  it('extends number series rightward and leftward per row', () => {
    const localSchema: Schema = {
      fields: [
        { id: 'a', name: 'A', type: 'number', width: 80 },
        { id: 'b', name: 'B', type: 'number', width: 80 },
        { id: 'c', name: 'C', type: 'number', width: 80 },
        { id: 'd', name: 'D', type: 'number', width: 80 },
      ],
    }
    const source = new InMemoryDataSource({
      schema: localSchema,
      rows: [
        { a: 1, b: 3 },
        { c: 10, d: 15 },
      ],
    })
    expect(
      computeFillWrites({
        data: source,
        source: r(0, 0, 0, 1),
        fill: r(0, 0, 2, 3),
        direction: 'right',
      }).map((w) => w.value),
    ).toEqual([5, 7])
    expect(
      computeFillWrites({
        data: source,
        source: r(1, 1, 2, 3),
        fill: r(1, 1, 0, 1),
        direction: 'left',
      }).map((w) => w.value),
    ).toEqual([0, 5])
  })

  it('extends text tail series and preserves numeric width', () => {
    const writes = computeFillWrites({
      data: data([{ label: 'Item 001' }, { label: 'Item 003' }, {}, {}]),
      source: r(0, 1, 0, 0),
      fill: r(2, 3, 0, 0),
      direction: 'down',
    })
    expect(writes.map((w) => w.value)).toEqual(['Item 005', 'Item 007'])
  })

  it('extends signed text tail series through zero', () => {
    const writes = computeFillWrites({
      data: data([{ label: 'Item -2' }, { label: 'Item -1' }, {}, {}]),
      source: r(0, 1, 0, 0),
      fill: r(2, 3, 0, 0),
      direction: 'down',
    })
    expect(writes.map((w) => w.value)).toEqual(['Item 0', 'Item 1'])
  })

  it('extends Date series by millisecond delta', () => {
    const writes = computeFillWrites({
      data: data([
        { date: new Date('2026-01-01T00:00:00Z') },
        { date: new Date('2026-01-03T00:00:00Z') },
        {},
        {},
      ]),
      source: r(0, 1, 2, 2),
      fill: r(2, 3, 2, 2),
      direction: 'down',
    })
    expect(writes.map((w) => (w.value as Date).toISOString().slice(0, 10))).toEqual([
      '2026-01-05',
      '2026-01-07',
    ])
  })

  it('falls back to repeating pattern for mixed or unstable samples', () => {
    const writes = computeFillWrites({
      data: data([{ label: 'A' }, { label: 'B' }, {}, {}, {}]),
      source: r(0, 1, 0, 0),
      fill: r(2, 4, 0, 0),
      direction: 'down',
    })
    expect(writes.map((w) => w.value)).toEqual(['A', 'B', 'A'])
  })

  it('computes each column independently for downward fill', () => {
    const writes = computeFillWrites({
      data: data([{ label: 'Q1', num: 1 }, { label: 'Q2', num: 3 }, {}, {}]),
      source: r(0, 1, 0, 1),
      fill: r(2, 3, 0, 1),
      direction: 'down',
    })
    expect(writes.map((w) => [w.fieldId, w.value])).toEqual([
      ['label', 'Q3'],
      ['num', 5],
      ['label', 'Q4'],
      ['num', 7],
    ])
  })
})

function r(startRow: number, endRow: number, startCol: number, endCol: number): CellRange {
  return { startRow, endRow, startCol, endCol }
}
