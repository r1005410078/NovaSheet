import { describe, expect, it } from 'bun:test'

import {
  CHUNK_SIZE,
  CellTypeStore,
  ChunkedAxis,
  FilterLayer,
  FrozenRegions,
  InMemoryDataSource,
  MIN_RESIZE_SIZE,
  RESIZE_HANDLE_HIT_SIZE,
  SortLayer,
  ViewPipeline,
  Viewport,
  columnIndexToLetter,
  computeResizeHandles,
  denseGridTheme,
  getCellContextMenuItems,
  getColumnHeaderContextMenuItems,
  getRowHeaderContextMenuItems,
  tokenize,
  wrapText,
  type ContextMenuContext,
  type ContextMenuItem,
  type Schema,
  type TextMeasurer,
} from '../../../src'
import { asRawRange } from '../../../src/kernel/coords/coordinates'
import { createHitTestFrame } from '../_helpers/fixtures'
import { expectGolden } from '../_helpers/golden'

const cellMenuContext: ContextMenuContext = {
  targetKind: 'cell',
  cell: { rowIndex: 0, colIndex: 0 },
  selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
  hasSelection: true,
  clipboardReady: false,
}

const fixedTextMeasurer: TextMeasurer = {
  measureWidth: (text) => text.length * 7,
}

describe('Core acceptance properties', () => {
  it('core.L0.theme-dense-grid-tokens matches full theme golden', () => {
    // theme 是视觉值唯一来源（CLAUDE.md 不变量 #4）——整棵树入金，任何 token 漂移显式过 review。
    expectGolden(
      import.meta.dir,
      'core.L0.theme-dense-grid-tokens',
      `${JSON.stringify(denseGridTheme, null, 2)}\n`,
    )
  })

  it('core.L0.geometry-column-letter maps indices to Excel letters', () => {
    expect(columnIndexToLetter(0)).toBe('A')
    expect(columnIndexToLetter(25)).toBe('Z')
    expect(columnIndexToLetter(26)).toBe('AA')
  })

  it('core.L0.geometry-viewport snapshot reflects scroll offset', () => {
    const rowsAxis = new ChunkedAxis({ count: 100, defaultSize: 28 })
    const colsAxis = new ChunkedAxis({ count: 5, defaultSize: 100 })
    const frozen = new FrozenRegions(rowsAxis, colsAxis, {})
    const viewport = new Viewport(rowsAxis, colsAxis, frozen)
    viewport.setSize(400, 280)
    viewport.setHeaderHeight(32)
    viewport.setScroll(0, 140)

    const main = viewport.snapshot().regions.find((region) => region.id === 'main')
    expect(main?.rowRange[0]).toBe(5)
  })

  it('core.L0.geometry-chunked-axis-boundaries exposes CHUNK_SIZE and boundary sizes', () => {
    expect(CHUNK_SIZE).toBe(1024)
    const axis = new ChunkedAxis({ count: 1025, defaultSize: 28 })
    expect(axis.getSize(1024)).toBe(28)
    expect(axis.getChunkCount()).toBe(2)
  })

  it('core.L0.resize-handles computes column handles and exposes constants', () => {
    expect(RESIZE_HANDLE_HIT_SIZE).toBeGreaterThan(0)
    expect(MIN_RESIZE_SIZE).toBeGreaterThan(0)

    const handles = computeResizeHandles(createHitTestFrame()).filter((handle) => handle.kind === 'column')
    expect(handles.length).toBeGreaterThan(0)
  })

  it('core.L0.context-menu-items matches full menu inventory golden', () => {
    const menuSchema: Schema = {
      fields: [
        { id: 'name', name: 'Name', type: 'text', width: 100 },
        { id: 'score', name: 'Score', type: 'number', width: 100 },
      ],
    }
    const pipeline = new ViewPipeline(
      new InMemoryDataSource({ schema: menuSchema, rows: [{ name: 'Ada', score: 2 }] }),
    )
    pipeline.add(new FilterLayer())
    pipeline.add(new SortLayer())
    const columnItems = getColumnHeaderContextMenuItems(
      { targetKind: 'columnHeader', field: menuSchema.fields[0]!, colIndex: 0 },
      pipeline,
    )

    const menuLine = (item: ContextMenuItem): string =>
      `${item.id} "${item.label}"${item.disabled ? ' disabled' : ''}${item.separatorAfter ? ' |sep' : ''}`
    const dump = [
      '== cell ==',
      ...getCellContextMenuItems(cellMenuContext).map(menuLine),
      '== rowHeader (2 rows) ==',
      ...getRowHeaderContextMenuItems(2, false).map(menuLine),
      '== columnHeader (sort/filter pipeline) ==',
      ...columnItems.map(menuLine),
    ].join('\n')
    expectGolden(import.meta.dir, 'core.L0.context-menu-items', `${dump}\n`)
  })

  it('core.L0.text-measure-wrap tokenizes words and wraps narrow text', () => {
    expect(tokenize('hello world')).toEqual(['hello ', 'world'])
    const wrapped = wrapText(
      'hello world',
      { font: '12px sans-serif', maxWidth: 20, lineHeight: 18 },
      fixedTextMeasurer,
    )
    expect(wrapped.lines.length).toBeGreaterThan(1)
  })

  it('core.L0.cell-type-store-raw-remap stores, clears, restores, and remaps raw cell type overrides', () => {
    const store = new CellTypeStore()
    const fields = [
      { id: 'a', name: 'A', type: 'text', width: 80 },
      { id: 'b', name: 'B', type: 'number', width: 80 },
      { id: 'c', name: 'C', type: 'date', width: 80 },
    ] as const

    store.set(asRawRange({ startRow: 1, endRow: 1, startCol: 1, endCol: 1 }), 'date')
    store.set(asRawRange({ startRow: 2, endRow: 2, startCol: 2, endCol: 2 }), 'checkbox')
    expect(store.resolve(1, 1, fields[1])).toBe('date')
    expect(store.resolve(0, 1, fields[1])).toBe('number')

    const before = store.snapshot()
    store.clear(asRawRange({ startRow: 1, endRow: 1, startCol: 1, endCol: 1 }))
    expect(store.resolve(1, 1, fields[1])).toBe('number')
    store.restore(before)
    expect(store.resolve(1, 1, fields[1])).toBe('date')

    store.remapAfterRowsInserted(1, 1)
    expect(store.resolve(2, 1, fields[1])).toBe('date')
    store.remapByRowIndexMap(new Map([[2, 4]]))
    expect(store.resolve(4, 1, fields[1])).toBe('date')
    expect(store.get(2, 1)).toBeUndefined()

    const colDeleteStore = new CellTypeStore()
    colDeleteStore.set(asRawRange({ startRow: 3, endRow: 3, startCol: 1, endCol: 1 }), 'date')
    colDeleteStore.set(asRawRange({ startRow: 3, endRow: 3, startCol: 2, endCol: 2 }), 'checkbox')
    colDeleteStore.remapAfterColsDeleted([2])
    expect(colDeleteStore.get(3, 2)).toBeUndefined()
    expect(colDeleteStore.get(3, 1)).toBe('date')
  })
})
