import { describe, expect, it } from 'bun:test'
import type { DataSource, DataSourceEvent, DataSourceListener } from '../../../src/kernel/data/DataSource'
import { InMemoryDataSource } from '../../../src/kernel/data/InMemoryDataSource'
import type { MutableDataSource } from '../../../src/kernel/data/MutableDataSource'
import type { CellValue, Row, Schema } from '../../../src/kernel/data/Schema'
import { SortLayer } from '../../../src/features/view/SortLayer'

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
    { id: 'link', name: 'Link', type: 'url', width: 160 },
    { id: 'due', name: 'Due', type: 'date', width: 120 },
    { id: 'done', name: 'Done', type: 'checkbox', width: 80 },
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

class MutableSchemaDataSource implements DataSource {
  private listeners = new Set<DataSourceListener>()

  constructor(
    private schemaValue: Schema,
    private rows: Row[],
  ) {}

  getRowCount(): number {
    return this.rows.length
  }

  getSchema(): Schema {
    return this.schemaValue
  }

  getRows(startIndex: number, endIndex: number): Row[] {
    return this.rows.slice(startIndex, endIndex + 1)
  }

  getCell(rowIndex: number, fieldId: string): CellValue | undefined {
    return this.rows[rowIndex]?.[fieldId]
  }

  subscribe(listener: DataSourceListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  setSchema(schemaValue: Schema): void {
    this.schemaValue = schemaValue
    this.emit({ type: 'schemaChanged' })
  }

  private emit(event: DataSourceEvent): void {
    for (const listener of this.listeners) listener(event)
  }
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

  it('sorts url fields with text collator semantics and null-ish values last', () => {
    const rows: Row[] = [
      { name: 'A', score: 1, status: 'Todo', tags: [], link: 'https://x.test/item-10' },
      { name: 'B', score: 1, status: 'Todo', tags: [], link: 'https://x.test/item-2' },
      { name: 'C', score: 1, status: 'Todo', tags: [], link: '' },
      { name: 'D', score: 1, status: 'Todo', tags: [], link: null },
    ]

    expect(sortedColumn('link', 'asc', rows)).toEqual([
      'https://x.test/item-2',
      'https://x.test/item-10',
      '',
      null,
    ])
    expect(sortedColumn('link', 'desc', rows)).toEqual([
      'https://x.test/item-10',
      'https://x.test/item-2',
      '',
      null,
    ])
  })

  it('date 列按 serial 升序/降序；非数字与空值殿后', () => {
    const rows: Row[] = [
      { name: 'A', score: 1, status: 'Todo', tags: [], due: 46000 },
      { name: 'B', score: 1, status: 'Todo', tags: [], due: 'not-a-date' },
      { name: 'C', score: 1, status: 'Todo', tags: [], due: 44000 },
      { name: 'D', score: 1, status: 'Todo', tags: [], due: null },
    ]

    expect(sortedColumn('due', 'asc', rows)).toEqual([44000, 46000, 'not-a-date', null])
    expect(sortedColumn('due', 'desc', rows)).toEqual([46000, 44000, 'not-a-date', null])
  })

  it('sorts checkbox fields with false before true and non-boolean values last', () => {
    const rows: Row[] = [
      { name: 'A', score: 1, status: 'Todo', tags: [], done: true },
      { name: 'B', score: 1, status: 'Todo', tags: [], done: null },
      { name: 'C', score: 1, status: 'Todo', tags: [], done: false },
      { name: 'D', score: 1, status: 'Todo', tags: [], done: 'yes' },
    ]

    expect(sortedColumn('done', 'asc', rows)).toEqual([false, true, null, 'yes'])
    expect(sortedColumn('done', 'desc', rows)).toEqual([true, false, null, 'yes'])
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

  it('reports the active direction only for the sorted field', () => {
    const layer = new SortLayer()

    expect(layer.getDirection('score')).toBeNull()
    layer.setSpec({ fieldId: 'score', direction: 'desc' })

    expect(layer.getDirection('score')).toBe('desc')
    expect(layer.getDirection('name')).toBeNull()
  })

  it('clears an invalid pre-wrap multiSelect spec once schema is known', () => {
    const layer = new SortLayer()

    expect(layer.setSpec({ fieldId: 'tags', direction: 'asc' })).toBe(true)
    const sorted = layer.wrap(makeSource())

    expect(layer.getSpec()).toBeNull()
    expect(sorted.getRows(0, 3)).toEqual(defaultRows())
  })

  it('rejects missing fields after schema capture and keeps the current spec unchanged', () => {
    const layer = new SortLayer()
    layer.wrap(makeSource())

    expect(layer.setSpec({ fieldId: 'missing', direction: 'asc' })).toBe(false)
    expect(layer.getSpec()).toBeNull()

    expect(layer.setSpec({ fieldId: 'score', direction: 'asc' })).toBe(true)
    expect(layer.setSpec({ fieldId: 'missing', direction: 'desc' })).toBe(false)
    expect(layer.getSpec()).toEqual({ fieldId: 'score', direction: 'asc' })
  })

  it('clears a pre-wrap missing-field spec once schema is known', () => {
    const layer = new SortLayer()

    expect(layer.setSpec({ fieldId: 'missing', direction: 'asc' })).toBe(true)
    const sorted = layer.wrap(makeSource())

    expect(layer.getSpec()).toBeNull()
    expect(sorted.getRows(0, 3)).toEqual(defaultRows())
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

  it('is transparent when the sort spec is null', () => {
    const source = makeSource()
    const sorted = new SortLayer().wrap(source)

    expect(sorted.getRowCount()).toBe(source.getRowCount())
    expect(sorted.getRows(0, 3)).toEqual(defaultRows())
    expect(sorted.getCell(0, 'name')).toBe('Beta')
    expect(sorted.getCell(1, 'score')).toBe(1)
    expect(sorted.resolveUnderlyingRow?.(2)).toBe(2)
    expect(sorted.findViewRow?.(3)).toBe(3)
  })

  it('passes rowsChanged through without resorting the current wrapper order', () => {
    const source = makeSource()
    const layer = new SortLayer()
    layer.setSpec({ fieldId: 'score', direction: 'asc' })
    const sorted = layer.wrap(source)
    const events: DataSourceEvent[] = []
    sorted.subscribe((event) => events.push(event))

    expect((sorted.getRows(0, 3) as Row[]).map((row) => row.name)).toEqual([
      'alpha',
      'Beta',
      'delta',
      'Gamma',
    ])

    source.updateCell(3, 'score', 0)

    expect(events).toEqual([{ type: 'rowsChanged', startIndex: 3, endIndex: 3 }])
    expect((sorted.getRows(0, 3) as Row[]).map((row) => row.name)).toEqual([
      'alpha',
      'Beta',
      'delta',
      'Gamma',
    ])
    expect(sorted.getCell(2, 'score')).toBe(0)
  })

  it('rebuilds mapping and re-emits rowCountChanged and reset events', () => {
    const source = makeSource()
    const layer = new SortLayer()
    layer.setSpec({ fieldId: 'score', direction: 'asc' })
    const sorted = layer.wrap(source)
    const events: DataSourceEvent[] = []
    sorted.subscribe((event) => events.push(event))

    source.setRows([
      { name: 'Zed', score: 10, status: 'Done', tags: [] },
      { name: 'Able', score: 0, status: 'Todo', tags: [] },
    ])

    expect(events).toEqual([{ type: 'rowCountChanged', newCount: 2 }, { type: 'reset' }])
    expect(sorted.getRowCount()).toBe(2)
    expect((sorted.getRows(0, 1) as Row[]).map((row) => row.name)).toEqual(['Able', 'Zed'])
    expect(sorted.resolveUnderlyingRow?.(0)).toBe(1)
  })

  it('rebuilds mapping and re-emits schemaChanged events', () => {
    const source = new MutableSchemaDataSource(
      { fields: [{ id: 'score', name: 'Score', type: 'number', width: 80 }] },
      [
        { score: 2, name: 'B' },
        { score: 1, name: 'A' },
      ],
    )
    const layer = new SortLayer()
    layer.setSpec({ fieldId: 'score', direction: 'asc' })
    const sorted = layer.wrap(source)
    const events: DataSourceEvent[] = []
    sorted.subscribe((event) => events.push(event))

    expect((sorted.getRows(0, 1) as Row[]).map((row) => row.name)).toEqual(['A', 'B'])

    source.setSchema({ fields: [{ id: 'score', name: 'Score', type: 'multiSelect', width: 80 }] })

    expect(events).toEqual([{ type: 'schemaChanged' }])
    expect(layer.getSpec()).toBeNull()
    expect((sorted.getRows(0, 1) as Row[]).map((row) => row.name)).toEqual(['B', 'A'])
    expect(sorted.resolveUnderlyingRow?.(0)).toBe(0)
  })

  it('stops reacting to upstream structural events after disposal', () => {
    const source = makeSource()
    const layer = new SortLayer()
    layer.setSpec({ fieldId: 'score', direction: 'asc' })
    const sorted = layer.wrap(source)
    const events: DataSourceEvent[] = []
    sorted.subscribe((event) => events.push(event))

    const disposable = sorted as { dispose?: () => void }
    disposable.dispose?.()
    source.setRows([
      { name: 'Zero', score: 0, status: 'Todo', tags: [] },
      { name: 'One', score: 1, status: 'Todo', tags: [] },
      { name: 'Two', score: 2, status: 'Todo', tags: [] },
      { name: 'Three', score: 3, status: 'Todo', tags: [] },
    ])

    expect(events).toEqual([])
    expect((sorted.getRows(0, 3) as Row[]).map((row) => row.name)).toEqual([
      'One',
      'Zero',
      'Three',
      'Two',
    ])
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
      { id: 'sort-asc', label: '升序排序', disabled: false, checked: false },
      { id: 'sort-desc', label: '降序排序', disabled: false, checked: false },
      { id: 'sort-none', label: '清除排序', disabled: true, checked: false },
    ])

    layer.setSpec({ fieldId: 'score', direction: 'desc' })

    expect(layer.headerDecoration(field)).toEqual({ sortIndicator: 'desc' })
    expect(layer.contextMenuItems({ targetKind: 'columnHeader', field, colIndex: 1 })).toEqual([
      { id: 'sort-asc', label: '升序排序', disabled: false, checked: false },
      { id: 'sort-desc', label: '降序排序', disabled: false, checked: true },
      { id: 'sort-none', label: '清除排序', disabled: false, checked: false },
    ])
  })
})
