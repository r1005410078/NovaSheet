import { describe, expect, it } from 'bun:test'
import { FilterLayer } from '../../../src/features/view/FilterLayer'
import { InMemoryDataSource } from '../../../src/kernel/data/InMemoryDataSource'
import { SortLayer } from '../../../src/features/view/SortLayer'
import { ViewPipeline } from '../../../src/features/view/ViewPipeline'
import type { Schema } from '../../../src/kernel/data/Schema'
import {
  getCellContextMenuItems,
  getColumnHeaderContextMenuItems,
  type ContextMenuContext,
} from '../../../src/features/context-menu/ContextMenuModel'

const baseCtx: ContextMenuContext = {
  targetKind: 'cell',
  cell: { rowIndex: 0, colIndex: 0 },
  selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
  hasSelection: true,
  clipboardReady: false,
}

const schema: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 100 },
    { id: 'score', name: 'Score', type: 'number', width: 100 },
  ],
}

function setup() {
  const source = new InMemoryDataSource({ rows: [{ name: 'Ada', score: 2 }], schema })
  const pipeline = new ViewPipeline(source)
  const filterLayer = new FilterLayer()
  const sortLayer = new SortLayer()
  pipeline.add(filterLayer)
  pipeline.add(sortLayer)
  return { pipeline, filterLayer, sortLayer }
}

describe('getCellContextMenuItems — Phase 4.0', () => {
  it('returns Cut / Copy / Paste in order', () => {
    expect(getCellContextMenuItems(baseCtx).map((i) => i.id)).toEqual(['cut', 'copy', 'paste'])
  })

  it('separator after Copy only', () => {
    const items = getCellContextMenuItems(baseCtx)
    expect(items[0]!.separatorAfter).toBeFalsy()
    expect(items[1]!.separatorAfter).toBe(true)
    expect(items[2]!.separatorAfter).toBeFalsy()
  })

  it('Cut / Copy enabled when hasSelection', () => {
    const items = getCellContextMenuItems(baseCtx)
    expect(items.find((i) => i.id === 'cut')!.disabled).toBe(false)
    expect(items.find((i) => i.id === 'copy')!.disabled).toBe(false)
  })

  it('Cut / Copy disabled when no selection', () => {
    const items = getCellContextMenuItems({ ...baseCtx, hasSelection: false })
    expect(items.find((i) => i.id === 'cut')!.disabled).toBe(true)
    expect(items.find((i) => i.id === 'copy')!.disabled).toBe(true)
  })

  it('Paste disabled when clipboardReady is false', () => {
    expect(getCellContextMenuItems(baseCtx).find((i) => i.id === 'paste')!.disabled).toBe(true)
  })

  it('Paste enabled when clipboardReady is true', () => {
    expect(
      getCellContextMenuItems({ ...baseCtx, clipboardReady: true }).find((i) => i.id === 'paste')!
        .disabled,
    ).toBe(false)
  })

  it('labels are stable Chinese strings', () => {
    const items = getCellContextMenuItems(baseCtx)
    expect(items.find((i) => i.id === 'cut')!.label).toBe('剪切')
    expect(items.find((i) => i.id === 'copy')!.label).toBe('复制')
    expect(items.find((i) => i.id === 'paste')!.label).toBe('粘贴')
  })
})

describe('getColumnHeaderContextMenuItems — Phase 4.4', () => {
  it('combines sort and filter items from ViewPipeline', () => {
    const { pipeline } = setup()
    const items = getColumnHeaderContextMenuItems(
      { targetKind: 'columnHeader', field: schema.fields[0]!, colIndex: 0 },
      pipeline,
    )

    expect(items.slice(0, 5).map((item) => item.id)).toEqual([
      'filter-open',
      'filter-clear',
      'sort-asc',
      'sort-desc',
      'sort-none',
    ])
  })

  it('enables sort-none only when current sort spec belongs to the column', () => {
    const { pipeline, sortLayer } = setup()
    sortLayer.setSpec({ fieldId: 'score', direction: 'asc' })

    const nameItems = getColumnHeaderContextMenuItems(
      { targetKind: 'columnHeader', field: schema.fields[0]!, colIndex: 0 },
      pipeline,
    )
    const scoreItems = getColumnHeaderContextMenuItems(
      { targetKind: 'columnHeader', field: schema.fields[1]!, colIndex: 1 },
      pipeline,
    )

    expect(nameItems.find((item) => item.id === 'sort-none')!.disabled).toBe(true)
    expect(scoreItems.find((item) => item.id === 'sort-none')!.disabled).toBe(false)
  })

  it('disables sort-asc and sort-desc for multiSelect header context', () => {
    const { pipeline } = setup()
    const items = getColumnHeaderContextMenuItems(
      { targetKind: 'columnHeader', field: schema.fields[0]!, colIndex: 0, multiSelect: true },
      pipeline,
    )

    expect(items.find((item) => item.id === 'sort-asc')!.disabled).toBe(true)
    expect(items.find((item) => item.id === 'sort-desc')!.disabled).toBe(true)
  })
})

describe('ContextMenuItem metadata — unified menu', () => {
  it('cell clipboard items expose icon shortcut and category', () => {
    const items = getCellContextMenuItems({ ...baseCtx, clipboardReady: true })

    expect(items.find((item) => item.id === 'cut')).toMatchObject({
      icon: { kind: 'builtin', name: 'cut' },
      shortcut: expect.any(String),
      category: 'clipboard',
    })
    expect(items.find((item) => item.id === 'copy')).toMatchObject({
      icon: { kind: 'builtin', name: 'copy' },
      shortcut: expect.any(String),
      category: 'clipboard',
    })
    expect(items.find((item) => item.id === 'paste')).toMatchObject({
      icon: { kind: 'builtin', name: 'paste' },
      shortcut: expect.any(String),
      category: 'clipboard',
    })
  })

  it('column menu structure items expose icon and structure category', () => {
    const { pipeline } = setup()
    const items = getColumnHeaderContextMenuItems(
      { targetKind: 'columnHeader', field: schema.fields[0]!, colIndex: 0 },
      pipeline,
    )

    expect(items.find((item) => item.id === 'insert-col-left')).toMatchObject({
      icon: { kind: 'builtin', name: 'plus' },
      category: 'structure',
    })
    expect(items.find((item) => item.id === 'delete-cols')).toMatchObject({
      icon: { kind: 'builtin', name: 'trash' },
      category: 'structure',
    })
    expect(items.find((item) => item.id === 'resize-column-width')).toMatchObject({
      icon: { kind: 'builtin', name: 'resize' },
      category: 'structure',
    })
  })
})
