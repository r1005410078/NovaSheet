import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'
import type { MutableDataSource } from '../../src/data/MutableDataSource'
import type { Row } from '../../src/data/Schema'
import { SortLayer } from '../../src/view/SortLayer'

const schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 120 },
    { id: 'score', name: 'Score', type: 'number', width: 80 },
    {
      id: 'status',
      name: 'Status',
      type: 'singleSelect',
      width: 100,
      options: { choices: ['Todo', 'Doing', 'Done'] },
    },
    {
      id: 'tags',
      name: 'Tags',
      type: 'multiSelect',
      width: 120,
      options: { choices: ['A', 'B'] },
    },
  ],
} as const

function makeSource(rows: Row[] = defaultRows()): InMemoryDataSource {
  return new InMemoryDataSource({ schema, rows })
}

function defaultRows(): Row[] {
  return [
    { name: 'Beta', score: 2, status: 'Done', tags: ['A'] },
    { name: 'alpha', score: 1, status: 'Todo', tags: ['B'] },
    { name: 'Gamma', score: null, status: 'Doing', tags: [] },
    { name: 'delta', score: 2, status: 'Todo', tags: ['A', 'B'] },
  ]
}

function sortedColumn(fieldId: string, direction: 'asc' | 'desc', rows = defaultRows()) {
  const layer = new SortLayer()
  expect(layer.setSpec({ fieldId, direction })).toBe(true)
  const sorted = layer.wrap(makeSource(rows))
  return Array.from({ length: sorted.getRowCount() }, (_, row) => sorted.getCell(row, fieldId))
}

describe('SortLayer', () => {
  it('sorts number fields with null values last in ascending and descending order', () => {
    expect(sortedColumn('score', 'asc')).toEqual([1, 2, 2, null])
    expect(sortedColumn('score', 'desc')).toEqual([2, 2, 1, null])
  })

  it('keeps equal values in their original upstream row order', () => {
    const layer = new SortLayer()
    layer.setSpec({ fieldId: 'score', direction: 'asc' })
    const sorted = layer.wrap(makeSource())

    const rows = sorted.getRows(0, 3) as Row[]
    expect(rows.map((row) => row.name)).toEqual(['alpha', 'Beta', 'delta', 'Gamma'])
    expect(sorted.resolveUnderlyingRow?.(1)).toBe(0)
    expect(sorted.resolveUnderlyingRow?.(2)).toBe(3)
  })

  it('sorts text fields with a base-sensitivity numeric collator', () => {
    expect(
      sortedColumn('name', 'asc', [
        { name: 'item 10', score: 1, status: 'Todo', tags: [] },
        { name: 'Item 2', score: 1, status: 'Todo', tags: [] },
        { name: '', score: 1, status: 'Todo', tags: [] },
        { name: 'alpha', score: 1, status: 'Todo', tags: [] },
      ]),
    ).toEqual(['alpha', 'Item 2', 'item 10', ''])
  })

  it('sorts singleSelect fields by configured choice order', () => {
    expect(sortedColumn('status', 'asc')).toEqual(['Todo', 'Todo', 'Doing', 'Done'])
    expect(sortedColumn('status', 'desc')).toEqual(['Done', 'Doing', 'Todo', 'Todo'])
  })

  it('rejects multiSelect fields and leaves the spec unchanged', () => {
    const layer = new SortLayer()
    layer.wrap(makeSource())

    expect(layer.setSpec({ fieldId: 'tags', direction: 'asc' })).toBe(false)
    expect(layer.getSpec()).toBeNull()
  })

  it('cycles a field through ascending, descending, and unsorted states', () => {
    const layer = new SortLayer()

    expect(layer.cycle('score')).toEqual({ fieldId: 'score', direction: 'asc' })
    expect(layer.getSpec()).toEqual({ fieldId: 'score', direction: 'asc' })
    expect(layer.cycle('score')).toEqual({ fieldId: 'score', direction: 'desc' })
    expect(layer.getSpec()).toEqual({ fieldId: 'score', direction: 'desc' })
    expect(layer.cycle('score')).toBeNull()
    expect(layer.getSpec()).toBeNull()
  })

  it('maps view rows to underlying rows and underlying rows back to sorted view rows', () => {
    const layer = new SortLayer()
    layer.setSpec({ fieldId: 'score', direction: 'asc' })
    const sorted = layer.wrap(makeSource())

    expect(sorted.resolveUnderlyingRow?.(0)).toBe(1)
    expect(sorted.findViewRow?.(1)).toBe(0)
    expect(sorted.findViewRow?.(0)).toBe(1)
    expect(sorted.findViewRow?.(99)).toBe(-1)
  })

  it('writes by view row for updateCell and by raw row for updateCellByUnderlyingRow', () => {
    const source = makeSource()
    const layer = new SortLayer()
    layer.setSpec({ fieldId: 'score', direction: 'asc' })
    const sorted = layer.wrap(source) as MutableDataSource

    sorted.updateCell(0, 'name', 'View row write')
    expect(source.getCell(1, 'name')).toBe('View row write')

    sorted.updateCellByUnderlyingRow?.(0, 'name', 'Raw row write')
    expect(source.getCell(0, 'name')).toBe('Raw row write')
    expect(sorted.getCell(1, 'name')).toBe('Raw row write')
  })

  it('exposes menu items and active header decoration for the sorted field', () => {
    const layer = new SortLayer()
    const field = schema.fields[1]!

    expect(layer.headerDecoration(field)).toBeNull()
    expect(layer.contextMenuItems({ targetKind: 'columnHeader', field, colIndex: 1 })).toEqual([
      { id: 'sort-asc', label: 'Sort ascending', disabled: false, checked: false },
      { id: 'sort-desc', label: 'Sort descending', disabled: false, checked: false },
      { id: 'sort-none', label: 'Clear sort', disabled: true, checked: false },
    ])

    layer.setSpec({ fieldId: 'score', direction: 'desc' })

    expect(layer.headerDecoration(field)).toEqual({ sortIndicator: 'desc' })
    expect(layer.contextMenuItems({ targetKind: 'columnHeader', field, colIndex: 1 })).toEqual([
      { id: 'sort-asc', label: 'Sort ascending', disabled: false, checked: false },
      { id: 'sort-desc', label: 'Sort descending', disabled: false, checked: true },
      { id: 'sort-none', label: 'Clear sort', disabled: false, checked: false },
    ])
  })
})
