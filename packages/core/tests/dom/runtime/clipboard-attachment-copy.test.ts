/**
 * Task 4: copy/cut 捕获选区 attachment 进 clipboardCache（view→raw 坐标，codec serialize）。
 * 复用 custom-editor-attachment.test.ts 的 makeEngine/makeHost/makeRenderer/makeFrameWithFields 模式。
 */
import { describe, expect, it, mock } from 'bun:test'
import { InMemoryDataSource } from '@zhiguang/core'
import type {
  CellAttachmentCodec,
  CellRange,
  CellTypeOverride,
  DataSource,
  GridEngine,
  GridSelection,
  Row,
  Schema,
  Theme,
} from '@zhiguang/core'
import type { WebHost } from '@zhiguang/core'
import type { RenderBackend } from '@zhiguang/core'
import { GridRuntime } from '@zhiguang/core'

// ---------------------------------------------------------------------------
// Test doubles — mirrors custom-editor-attachment.test.ts setup
// ---------------------------------------------------------------------------

function makeEngine(): GridEngine {
  return {
    setData: mock(() => {}),
    setViewData: mock(() => {}),
    resizeExcelWorkspace: mock(() => false),
    setTheme: mock(() => {}),
    setFrozen: mock(() => {}),
    setViewportSize: mock(() => {}),
    setHeaderHeight: mock(() => {}),
    setScroll: mock(() => {}),
    setRowHeight: mock(() => {}),
    getRowHeight: mock(() => 28),
    setColumnWidth: mock(() => {}),
    selectCell: mock(() => {}),
    navigateSelection: mock(() => false),
    beginCellEdit: mock(() => false),
    updateCellEditDraft: mock(() => {}),
    cancelCellEdit: mock(() => {}),
    commitCellEdit: mock(() => false),
    commitCellValue: mock(() => false),
    isCellEditing: mock(() => false),
    clearRange: mock(() => {}),
    clearSelection: mock(() => {}),
    getSelection: mock(
      () =>
        ({
          activeCell: null,
          anchorCell: null,
          extentCell: null,
          selectedRange: null,
        }) satisfies GridSelection,
    ),
    getFrame: mock(() => ({
      data: {} as DataSource,
      theme: { metrics: { headerHeight: 32 } } as Theme,
      rowsAxis: {
        getCount: () => 10,
        positionToIndex: (pos: number) => Math.floor(pos / 28),
      } as never,
      colsAxis: {
        positionToIndex: (pos: number) => Math.floor(pos / 100),
      } as never,
      viewport: {
        contentRect: { width: 400, height: 300 },
        headerHeight: 32,
        regions: [
          {
            id: 'main',
            rowBand: 'middle',
            colBand: 'center',
            rowRange: [0, 9],
            colRange: [0, 2],
            rect: { x: 0, y: 32, width: 300, height: 268 },
            scrollOffsetX: 0,
            scrollOffsetY: 0,
            zIndex: 10,
          },
        ],
      } as never,
      collapsedRowGaps: [],
      collapsedColGaps: [],
    })),
    getRowsTotalSize: () => 280,
    getColsTotalSize: () => 200,
    getColumnIndex: () => 0,
    getTheme: () => ({ metrics: { headerHeight: 32, rowHeight: 28 } }) as Theme,
    getRowsAxis: () =>
      ({
        getCount: () => 10,
        indexToPosition: (i: number) => i * 28,
        getSize: () => 28,
      }) as never,
    getColsAxis: () =>
      ({
        indexToPosition: () => 0,
      }) as never,
    getViewport: mock(() => ({ getRowHeaderWidth: () => 0, getHeaderHeight: () => 32 }) as never),
    getData: mock(() => ({}) as never),
    undo: mock(() => undefined),
    redo: mock(() => undefined),
    canUndo: mock(() => false),
    canRedo: mock(() => false),
    commitRowResize: mock(() => {}),
    commitColumnResize: mock(() => {}),
    commitPaste: mock(() => {}),
    commitFill: mock(() => null),
    getFillMergeSnap: mock(() => ({ rowSpan: 1, colSpan: 1 })),
    unhideRows: mock(() => {}),
    getHiddenRows: mock(() => [] as readonly number[]),
    insertRows: mock(() => [] as readonly number[]),
    deleteRows: mock(() => {}),
    hideRows: mock(() => {}),
    setRowHeights: mock(() => {}),
    setSelection: mock(() => {}),
    getColumnGroups: mock(() => []),
    selectColumnGroup: mock(() => false),
    insertCols: mock(() => [] as never),
    deleteCols: mock(() => [] as never),
    hideCols: mock(() => {}),
    unhideCols: mock(() => {}),
    setColumnWidths: mock(() => {}),
    getHiddenCols: mock(() => [] as readonly string[]),
    getFrozenConfig: mock(() => ({ topRows: 0, leftCols: 0, rightCols: 0 })),
    moveCols: mock(() => false),
    moveRows: mock(() => false),
    setFillColor: mock(() => false),
    setBorders: mock(() => false),
    setValueFormat: mock(() => false),
    setCellType: mock((_range, _type): boolean => false),
    clearCellType: mock((_range): boolean => false),
    getCellType: mock((_viewRow: number, _viewCol: number): CellTypeOverride => 'text'),
    setTextWrap: mock(() => false),
    getCellFormat: mock(() => undefined),
    getViewCellFormat: mock(() => undefined),
    mergeCells: mock(() => false),
    unmergeCells: mock(() => false),
    getMergeRegion: mock(() => null),
    getViewMergeRegion: mock(() => null),
    setCellAttachment: mock(() => true),
    getCellAttachment: mock((): unknown => undefined),
    getAttachmentNamespaces: mock(() => [] as readonly string[]),
    getAttachmentCodec: mock((_namespace: string) => undefined),
    viewRowToRaw: mock((viewRow: number) => viewRow),
    viewColToRaw: mock((viewCol: number) => viewCol),
    viewRangeToRaw: mock((range: CellRange) => range as any),
    setValidationRule: mock(() => undefined),
    clearValidationRule: mock(() => undefined),
    validateAll: mock(() => undefined),
    getValidationState: mock(() => null),
    setValidationRedrawCallback: mock(() => undefined),
    setDataChangeRedrawCallback: mock(() => undefined),
    setHoveredColumnHeaderMenu: mock((_state) => undefined),
    dispose: mock(() => undefined),
  }
}

function makeHost(): WebHost {
  return {
    attach: mock(() => {}),
    applyScrollbarTheme: mock(() => {}),
    setScrollSize: mock(() => {}),
    setCursor: mock(() => {}),
    scrollTo: mock(() => {}),
    getDpr: () => 1,
    getContainerSize: () => ({ width: 400, height: 300 }),
    getContainerBoundingRect: () => ({ left: 0, top: 0 }),
    getScrollPosition: () => ({ scrollTop: 0, scrollLeft: 0 }),
    focusScrollHost: mock(() => {}),
    destroy: mock(() => {}),
  }
}

function makeRenderer(): RenderBackend {
  return {
    mount: mock(() => {}),
    resize: mock(() => {}),
    render: mock(() => {}),
    destroy: mock(() => {}),
  }
}

function makeFrameWithFields(
  fields: Schema['fields'],
  rows: readonly Row[] = [{ owner: 'Alice' }],
) {
  const data = new InMemoryDataSource({
    rows: [...rows],
    schema: { fields },
  })
  return {
    data,
    theme: { metrics: { headerHeight: 32 } } as Theme,
    rowsAxis: {
      getCount: () => rows.length,
      positionToIndex: (pos: number) => Math.floor(pos / 28),
      indexToPosition: (i: number) => i * 28,
      getSize: () => 28,
    } as never,
    colsAxis: {
      getCount: () => fields.length,
      positionToIndex: (pos: number) => Math.floor(pos / 160),
      indexToPosition: (i: number) => i * 160,
      getSize: (i: number) => fields[i]?.width ?? 160,
    } as never,
    viewport: {
      contentRect: { width: 400, height: 300 },
      headerHeight: 32,
      regions: [
        {
          id: 'main',
          rowBand: 'middle',
          colBand: 'center',
          rowRange: [0, rows.length - 1],
          colRange: [0, fields.length - 1],
          rect: { x: 0, y: 32, width: fields.length * 160, height: 268 },
          scrollOffsetX: 0,
          scrollOffsetY: 0,
          zIndex: 10,
        },
      ],
    } as never,
    collapsedRowGaps: [],
    collapsedColGaps: [],
  }
}

// ---------------------------------------------------------------------------
// demo codec (serialize / deserialize)
// ---------------------------------------------------------------------------
interface DemoAttachment {
  v: number
}

const demoCodec: CellAttachmentCodec<DemoAttachment> = {
  namespace: 'demo',
  serialize: (data) => JSON.stringify(data),
  deserialize: (raw) => JSON.parse(raw) as DemoAttachment,
}

// ---------------------------------------------------------------------------
// helpers: access private clipboard cache (storage lives in ClipboardController
// since GridRuntime 拆分 Task 4; reach it via the same private-field cast pattern,
// retargeted at `runtime.clipboard`'s test-support accessor)
// ---------------------------------------------------------------------------
type ClipboardCacheShape = {
  range: { startRow: number; endRow: number; startCol: number; endCol: number }
  rows: readonly Row[]
  tsvHash: number
  attachments?: ReadonlyArray<ReadonlyArray<Record<string, string>>>
}
function getCache(runtime: GridRuntime): ClipboardCacheShape | null {
  return (
    runtime as unknown as {
      clipboard: { peekCacheForLegacyTest(): ClipboardCacheShape | null }
    }
  ).clipboard.peekCacheForLegacyTest()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('clipboard-attachment-copy — Task 4', () => {
  const schema: Schema = {
    fields: [{ id: 'a', name: 'A', type: 'text', width: 160 }],
  }

  function setupCopy(attachment: DemoAttachment | null = { v: 42 }) {
    const engine = makeEngine()
    const rows: Row[] = [{ a: 'hello' }]
    const data = new InMemoryDataSource({ rows, schema })
    engine.getData = mock(() => data as never)
    engine.getFrame = mock(() => makeFrameWithFields(schema.fields, rows))

    // Selection: single cell (0,0)
    engine.getSelection = mock(() => ({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 0, colIndex: 0 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
    }))

    // view===raw (identity) — no sort/filter
    engine.viewRowToRaw = mock((r: number) => r)
    engine.viewColToRaw = mock((c: number) => c)

    // attachment set on raw (0,0)
    engine.getCellAttachment = mock((ns: string, rawRow: number, rawCol: number): unknown => {
      if (ns === 'demo' && rawRow === 0 && rawCol === 0) return attachment ?? undefined
      return undefined
    })
    engine.getAttachmentNamespaces = mock(() => ['demo'] as readonly string[])
    engine.getAttachmentCodec = mock(
      (_ns: string) => demoCodec as CellAttachmentCodec<unknown> | undefined,
    )

    const runtime = new GridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
    runtime.setClipboardAdapter({
      writeText: mock(async () => true),
      readText: mock(async () => ''),
    } as never)

    return { engine, runtime }
  }

  it('handleClipboardCopy: clipboardCache.attachments 含 serialize 后附件（偏移 [0][0]）', async () => {
    const { runtime } = setupCopy({ v: 42 })
    const ok = await runtime.handleClipboardCopy()
    expect(ok).toBe(true)

    const cache = getCache(runtime)
    expect(cache).not.toBeNull()
    expect(cache!.attachments).toBeDefined()
    // 1 row × 1 col
    expect(cache!.attachments!.length).toBe(1)
    expect(cache!.attachments![0]!.length).toBe(1)
    // demo codec serialize({ v: 42 }) === '{"v":42}'
    expect(cache!.attachments![0]![0]!['demo']).toBe(JSON.stringify({ v: 42 }))
  })

  it('handleClipboardCut: clipboardCache.attachments 同样被填入', async () => {
    const { runtime } = setupCopy({ v: 7 })
    const ok = await runtime.handleClipboardCut()
    expect(ok).toBe(true)

    const cache = getCache(runtime)
    expect(cache!.attachments![0]![0]!['demo']).toBe(JSON.stringify({ v: 7 }))
  })

  it('无 attachment 的格：对应位置为空对象 {}', async () => {
    const { runtime } = setupCopy(null)
    await runtime.handleClipboardCopy()
    const cache = getCache(runtime)
    expect(cache!.attachments![0]![0]).toEqual({})
  })

  it('无注册 namespace：attachments 全为空对象', async () => {
    const { engine, runtime } = setupCopy({ v: 99 })
    engine.getAttachmentNamespaces = mock(() => [] as readonly string[])
    await runtime.handleClipboardCopy()
    const cache = getCache(runtime)
    expect(cache!.attachments![0]![0]).toEqual({})
  })

  it('view→raw 转换被调用（坐标正确）', async () => {
    const { engine, runtime } = setupCopy({ v: 5 })
    await runtime.handleClipboardCopy()
    // viewRowToRaw(0) and viewColToRaw(0) must have been called during capture
    expect(engine.viewRowToRaw).toHaveBeenCalledWith(0)
    expect(engine.viewColToRaw).toHaveBeenCalledWith(0)
  })

  it('多格选区：attachments 维度正确（2×1）', async () => {
    const engine = makeEngine()
    const rows: Row[] = [{ a: 'r0' }, { a: 'r1' }]
    const data = new InMemoryDataSource({ rows, schema })
    engine.getData = mock(() => data as never)
    engine.getFrame = mock(() => makeFrameWithFields(schema.fields, rows))
    engine.getSelection = mock(() => ({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 1, colIndex: 0 },
      selectedRange: { startRow: 0, endRow: 1, startCol: 0, endCol: 0 },
    }))
    engine.viewRowToRaw = mock((r: number) => r)
    engine.viewColToRaw = mock((c: number) => c)
    engine.getCellAttachment = mock((ns: string, rawRow: number, _rawCol: number): unknown => {
      if (ns === 'demo' && rawRow === 0) return { v: 10 }
      if (ns === 'demo' && rawRow === 1) return { v: 20 }
      return undefined
    })
    engine.getAttachmentNamespaces = mock(() => ['demo'] as readonly string[])
    engine.getAttachmentCodec = mock(
      (_ns: string) => demoCodec as CellAttachmentCodec<unknown> | undefined,
    )

    const runtime = new GridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
    runtime.setClipboardAdapter({
      writeText: mock(async () => true),
      readText: mock(async () => ''),
    } as never)

    await runtime.handleClipboardCopy()
    const cache = getCache(runtime)
    expect(cache!.attachments!.length).toBe(2)
    expect(cache!.attachments![0]![0]!['demo']).toBe(JSON.stringify({ v: 10 }))
    expect(cache!.attachments![1]![0]!['demo']).toBe(JSON.stringify({ v: 20 }))
  })
})
