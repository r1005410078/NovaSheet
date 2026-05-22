import { describe, expect, it } from 'bun:test'
import type { DataSource, DataSourceEvent, DataSourceListener } from '../../src/data/DataSource'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'
import type { MutableDataSource } from '../../src/data/MutableDataSource'
import type { CellValue, Row, Schema } from '../../src/data/Schema'
import { FilterLayer } from '../../src/view/FilterLayer'

const schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 120 },
    { id: 'link', name: 'Link', type: 'url', width: 160 },
    { id: 'score', name: 'Score', type: 'number', width: 80 },
    { id: 'due', name: 'Due', type: 'date', width: 120 },
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
      options: { choices: ['A', 'B', 'C'] },
    },
    { id: 'done', name: 'Done', type: 'checkbox', width: 80 },
  ],
} as const

function defaultRows(): Row[] {
  return [
    {
      name: 'Alpha',
      link: 'https://alpha.test',
      score: 5,
      due: new Date('2024-01-10T00:00:00.000Z'),
      status: 'Todo',
      tags: ['A'],
      done: false,
    },
    {
      name: 'beta',
      link: '',
      score: 10,
      due: new Date('2024-02-10T00:00:00.000Z'),
      status: 'Doing',
      tags: ['B', 'C'],
      done: true,
    },
    {
      name: 'ALPINE',
      link: 'https://docs.test',
      score: 15,
      due: 'not-a-date',
      status: 'Done',
      tags: [],
      done: false,
    },
    {
      name: '',
      link: null,
      score: null,
      due: null,
      status: '',
      tags: ['C'],
      done: null,
    },
  ]
}

function makeSource(rows: Row[] = defaultRows()): InMemoryDataSource {
  return new InMemoryDataSource({ schema, rows })
}

function filteredNames(layer: FilterLayer, rows = defaultRows()): Array<CellValue | undefined> {
  const filtered = layer.wrap(makeSource(rows))
  return Array.from({ length: filtered.getRowCount() }, (_, row) => filtered.getCell(row, 'name'))
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

  listenerCount(): number {
    return this.listeners.size
  }

  private emit(event: DataSourceEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}

describe('FilterLayer', () => {
  it('filters text contains and equals with explicit case sensitivity', () => {
    const insensitiveContains = new FilterLayer()
    insensitiveContains.setSpec({
      fieldId: 'name',
      op: { kind: 'text-contains', value: 'alp', caseSensitive: false },
    })
    expect(filteredNames(insensitiveContains)).toEqual(['Alpha', 'ALPINE'])

    const sensitiveContains = new FilterLayer()
    sensitiveContains.setSpec({
      fieldId: 'name',
      op: { kind: 'text-contains', value: 'alp', caseSensitive: true },
    })
    expect(filteredNames(sensitiveContains)).toEqual([])

    const insensitiveEquals = new FilterLayer()
    insensitiveEquals.setSpec({
      fieldId: 'name',
      op: { kind: 'text-equals', value: 'alpha', caseSensitive: false },
    })
    expect(filteredNames(insensitiveEquals)).toEqual(['Alpha'])

    const sensitiveEquals = new FilterLayer()
    sensitiveEquals.setSpec({
      fieldId: 'name',
      op: { kind: 'text-equals', value: 'Alpha', caseSensitive: true },
    })
    expect(filteredNames(sensitiveEquals)).toEqual(['Alpha'])
  })

  it('filters number fields by closed ranges and exact numeric equality', () => {
    const between = new FilterLayer()
    between.setSpec({ fieldId: 'score', op: { kind: 'number-between', min: 10, max: 15 } })
    expect(filteredNames(between)).toEqual(['beta', 'ALPINE'])

    const unbounded = new FilterLayer()
    unbounded.setSpec({ fieldId: 'score', op: { kind: 'number-between', min: null, max: 10 } })
    expect(filteredNames(unbounded)).toEqual(['Alpha', 'beta'])

    const equals = new FilterLayer()
    equals.setSpec({ fieldId: 'score', op: { kind: 'number-equals', value: 5 } })
    expect(filteredNames(equals)).toEqual(['Alpha'])
  })

  it('filters date fields by a closed time interval and ignores invalid dates', () => {
    const layer = new FilterLayer()
    layer.setSpec({
      fieldId: 'due',
      op: {
        kind: 'date-between',
        start: new Date('2024-01-10T00:00:00.000Z'),
        end: new Date('2024-02-01T00:00:00.000Z'),
      },
    })

    expect(filteredNames(layer)).toEqual(['Alpha'])
  })

  it('filters select fields with inclusion and multiSelect overlap semantics', () => {
    const single = new FilterLayer()
    single.setSpec({ fieldId: 'status', op: { kind: 'select-in', values: ['Todo', 'Done'] } })
    expect(filteredNames(single)).toEqual(['Alpha', 'ALPINE'])

    const multi = new FilterLayer()
    multi.setSpec({ fieldId: 'tags', op: { kind: 'select-in', values: ['C'] } })
    expect(filteredNames(multi)).toEqual(['beta', ''])
  })

  it('filters checkbox fields by strict boolean equality', () => {
    const checked = new FilterLayer()
    checked.setSpec({ fieldId: 'done', op: { kind: 'checkbox-equals', value: true } })
    expect(filteredNames(checked)).toEqual(['beta'])

    const unchecked = new FilterLayer()
    unchecked.setSpec({ fieldId: 'done', op: { kind: 'checkbox-equals', value: false } })
    expect(filteredNames(unchecked)).toEqual(['Alpha', 'ALPINE'])
  })

  it('filters empty and non-empty values by field type', () => {
    const emptyText = new FilterLayer()
    emptyText.setSpec({ fieldId: 'name', op: { kind: 'is-empty' } })
    expect(filteredNames(emptyText)).toEqual([''])

    const nonEmptyText = new FilterLayer()
    nonEmptyText.setSpec({ fieldId: 'name', op: { kind: 'is-not-empty' } })
    expect(filteredNames(nonEmptyText)).toEqual(['Alpha', 'beta', 'ALPINE'])

    const emptyMulti = new FilterLayer()
    emptyMulti.setSpec({ fieldId: 'tags', op: { kind: 'is-empty' } })
    expect(filteredNames(emptyMulti)).toEqual(['ALPINE'])
  })

  it('clears only the active field and treats non-active clears as no-ops', () => {
    const layer = new FilterLayer()
    layer.wrap(makeSource())
    layer.setSpec({ fieldId: 'score', op: { kind: 'number-equals', value: 5 } })

    expect(layer.clear('name')).toBe(false)
    expect(layer.getSpec()).toEqual({ fieldId: 'score', op: { kind: 'number-equals', value: 5 } })

    expect(layer.clear('score')).toBe(true)
    expect(layer.getSpec()).toBeNull()
  })

  it('passes rowsChanged through without re-filtering the current wrapper', () => {
    const source = makeSource()
    const layer = new FilterLayer()
    layer.setSpec({ fieldId: 'score', op: { kind: 'number-between', min: 10, max: null } })
    const filtered = layer.wrap(source)
    const events: DataSourceEvent[] = []
    filtered.subscribe((event) => events.push(event))

    expect((filtered.getRows(0, 1) as Row[]).map((row) => row.name)).toEqual(['beta', 'ALPINE'])

    source.updateCell(1, 'score', 0)

    expect(events).toEqual([{ type: 'rowsChanged', startIndex: 1, endIndex: 1 }])
    expect((filtered.getRows(0, 1) as Row[]).map((row) => row.name)).toEqual(['beta', 'ALPINE'])
    expect(filtered.getCell(0, 'score')).toBe(0)
  })

  it('maps view rows to raw underlying rows and raw rows back to filtered view rows', () => {
    const layer = new FilterLayer()
    layer.setSpec({ fieldId: 'score', op: { kind: 'number-between', min: 10, max: null } })
    const filtered = layer.wrap(makeSource())

    expect(filtered.resolveUnderlyingRow?.(0)).toBe(1)
    expect(filtered.resolveUnderlyingRow?.(1)).toBe(2)
    expect(filtered.findViewRow?.(1)).toBe(0)
    expect(filtered.findViewRow?.(0)).toBe(-1)
    expect(filtered.findViewRow?.(99)).toBe(-1)
  })

  it('writes visible rows by view index and filtered-out rows by underlying row', () => {
    const source = makeSource()
    const layer = new FilterLayer()
    layer.setSpec({ fieldId: 'score', op: { kind: 'number-between', min: 10, max: null } })
    const filtered = layer.wrap(source) as MutableDataSource

    filtered.updateCell(0, 'name', 'Visible write')
    expect(source.getCell(1, 'name')).toBe('Visible write')

    filtered.updateCellByUnderlyingRow?.(0, 'name', 'Filtered raw write')
    expect(source.getCell(0, 'name')).toBe('Filtered raw write')
    expect(filtered.findViewRow?.(0)).toBe(-1)
  })

  it('rejects incompatible specs after schema capture and clears invalid specs on schema change', () => {
    const source = new MutableSchemaDataSource(
      { fields: [{ id: 'score', name: 'Score', type: 'number', width: 80 }] },
      [{ score: 1 }, { score: 2 }],
    )
    const layer = new FilterLayer()
    const filtered = layer.wrap(source)
    const events: DataSourceEvent[] = []
    filtered.subscribe((event) => events.push(event))

    expect(layer.setSpec({ fieldId: 'score', op: { kind: 'text-contains', value: '1', caseSensitive: false } })).toBe(
      false,
    )
    expect(layer.setSpec({ fieldId: 'score', op: { kind: 'number-equals', value: 1 } })).toBe(true)

    source.setSchema({ fields: [{ id: 'score', name: 'Score', type: 'text', width: 80 }] })

    expect(events).toEqual([{ type: 'schemaChanged' }])
    expect(layer.getSpec()).toBeNull()
    expect(filtered.getRowCount()).toBe(2)
  })

  it('is transparent when the spec is null and rebuilds row count on structural events', () => {
    const source = makeSource()
    const layer = new FilterLayer()
    const filtered = layer.wrap(source)
    const events: DataSourceEvent[] = []
    filtered.subscribe((event) => events.push(event))

    expect(filtered.getRowCount()).toBe(4)
    expect(filtered.getRows(0, 3)).toEqual(defaultRows())

    layer.setSpec({ fieldId: 'score', op: { kind: 'number-equals', value: 5 } })
    const rebuilt = layer.wrap(source)
    expect(rebuilt.getRowCount()).toBe(1)

    source.setRows([{ name: 'Fresh', score: 5, tags: [], done: false }])
    expect(events).toEqual([{ type: 'rowCountChanged', newCount: 1 }, { type: 'reset' }])
    expect(filtered.getRowCount()).toBe(1)
  })

  it('exposes menu items and active header decoration for the filtered field', () => {
    const layer = new FilterLayer()
    const field = schema.fields[2]!

    expect(layer.headerDecoration(field)).toBeNull()
    expect(layer.contextMenuItems({ targetKind: 'columnHeader', field, colIndex: 2 })).toEqual([
      { id: 'filter-open', label: 'Filter...', disabled: false, checked: false },
      { id: 'filter-clear', label: 'Clear filter', disabled: true, checked: false },
    ])

    layer.setSpec({ fieldId: 'score', op: { kind: 'number-equals', value: 5 } })

    expect(layer.headerDecoration(field)).toEqual({ filterActive: true })
    expect(layer.contextMenuItems({ targetKind: 'columnHeader', field, colIndex: 2 })).toEqual([
      { id: 'filter-open', label: 'Filter...', disabled: false, checked: true },
      { id: 'filter-clear', label: 'Clear filter', disabled: false, checked: false },
    ])
  })

  it('stops reacting to upstream structural events after disposal and releases subscription', () => {
    const source = new MutableSchemaDataSource(schema, defaultRows())
    const layer = new FilterLayer()
    layer.setSpec({ fieldId: 'score', op: { kind: 'number-between', min: 10, max: null } })
    const filtered = layer.wrap(source)
    const events: DataSourceEvent[] = []
    filtered.subscribe((event) => events.push(event))

    expect(source.listenerCount()).toBe(1)
    const disposable = filtered as { dispose?: () => void }
    disposable.dispose?.()

    expect(source.listenerCount()).toBe(0)
    source.setSchema({ fields: [{ id: 'score', name: 'Score', type: 'text', width: 80 }] })

    expect(events).toEqual([])
    expect(layer.getSpec()).toEqual({ fieldId: 'score', op: { kind: 'number-between', min: 10, max: null } })
    expect(filtered.getRowCount()).toBe(2)
  })
})
