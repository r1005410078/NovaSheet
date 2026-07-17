/**
 * Task 1：验证 custom editor open ctx.setAttachment 经 view→raw 写到 engine。
 * 复用 GridRuntime.test.ts 的 makeEngine/makeHost/makeRenderer/makeFrameWithFields 模式。
 */
import { describe, expect, it, mock } from 'bun:test'
import { InMemoryDataSource } from '@zhiguang/core'
import type {
  CellEditorOpenContext,
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

describe('custom editor open ctx.setAttachment', () => {
  it('ctx.setAttachment is injected when editor is opened', () => {
    const engine = makeEngine()
    engine.getFrame = mock(() =>
      makeFrameWithFields(
        [{ id: 'text', name: 'Text', type: 'assignee', width: 160 }],
        [{ text: 'hello' }, { text: 'world' }],
      ),
    )

    let capturedCtx: CellEditorOpenContext | undefined
    const editor = { open: mock((ctx: CellEditorOpenContext) => { capturedCtx = ctx }) }

    const runtime = new GridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      cellEditors: { assignee: editor },
    })

    // 触发 double-click 在 row=1, col=0
    runtime.handleHostDoubleClick({ x: 8, y: 64, shiftKey: false })

    expect(editor.open).toHaveBeenCalledTimes(1)
    expect(capturedCtx).toBeDefined()
    expect(typeof capturedCtx!.setAttachment).toBe('function')
  })

  it('ctx.setAttachment delegates to engine.setCellAttachment with view→raw mapping', () => {
    const engine = makeEngine()
    // view===raw (identity mapping) — no sort/filter
    engine.viewRowToRaw = mock((viewRow: number) => viewRow)
    engine.viewColToRaw = mock((viewCol: number) => viewCol)
    engine.setCellAttachment = mock(() => true)

    engine.getFrame = mock(() =>
      makeFrameWithFields(
        [{ id: 'text', name: 'Text', type: 'assignee', width: 160 }],
        [{ text: 'hello' }, { text: 'world' }],
      ),
    )

    let capturedCtx: CellEditorOpenContext | undefined
    const editor = { open: mock((ctx: CellEditorOpenContext) => { capturedCtx = ctx }) }

    const runtime = new GridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      cellEditors: { assignee: editor },
    })

    // row=1, col=0 (double-click at y=64 → row 1 @ 28px/row + 32 header)
    runtime.handleHostDoubleClick({ x: 8, y: 64, shiftKey: false })

    expect(capturedCtx?.setAttachment).toBeDefined()
    const result = capturedCtx!.setAttachment!('richText', [{ start: 0, end: 5, attrs: { bold: true } }])
    expect(result).toBe(true)
    expect(engine.viewRowToRaw).toHaveBeenCalledWith(1)
    expect(engine.viewColToRaw).toHaveBeenCalledWith(0)
    expect(engine.setCellAttachment).toHaveBeenCalledWith(
      'richText',
      1, // raw row
      0, // raw col
      [{ start: 0, end: 5, attrs: { bold: true } }],
    )
  })

  it('ctx.getAttachment reads existing attachment via view→raw mapping', () => {
    const runs = [{ start: 1, end: 3, attrs: { bold: true } }]
    const engine = makeEngine()
    engine.viewRowToRaw = mock((viewRow: number) => viewRow)
    engine.viewColToRaw = mock((viewCol: number) => viewCol)
    // 预存附件：row=1, col=0 (raw === view here)
    engine.getCellAttachment = mock((ns: string, _rawRow: number, _rawCol: number): unknown => {
      if (ns === 'richText') return runs
      return undefined
    })

    engine.getFrame = mock(() =>
      makeFrameWithFields(
        [{ id: 'text', name: 'Text', type: 'assignee', width: 160 }],
        [{ text: 'hello' }, { text: 'world' }],
      ),
    )

    let capturedCtx: CellEditorOpenContext | undefined
    const editor = { open: mock((ctx: CellEditorOpenContext) => { capturedCtx = ctx }) }

    const runtime = new GridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      cellEditors: { assignee: editor },
    })

    // double-click at y=64 → row 1
    runtime.handleHostDoubleClick({ x: 8, y: 64, shiftKey: false })

    expect(capturedCtx?.getAttachment).toBeDefined()
    const result = capturedCtx!.getAttachment!('richText')
    expect(result).toEqual(runs)
    expect(engine.viewRowToRaw).toHaveBeenCalledWith(1)
    expect(engine.viewColToRaw).toHaveBeenCalledWith(0)
    expect(engine.getCellAttachment).toHaveBeenCalledWith('richText', 1, 0)
  })

  it('ctx.getAttachment returns undefined when no attachment exists', () => {
    const engine = makeEngine()
    engine.getCellAttachment = mock((): unknown => undefined)

    engine.getFrame = mock(() =>
      makeFrameWithFields(
        [{ id: 'text', name: 'Text', type: 'assignee', width: 160 }],
        [{ text: 'hello' }],
      ),
    )

    let capturedCtx: CellEditorOpenContext | undefined
    const editor = { open: mock((ctx: CellEditorOpenContext) => { capturedCtx = ctx }) }

    const runtime = new GridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      cellEditors: { assignee: editor },
    })

    runtime.handleHostDoubleClick({ x: 8, y: 36, shiftKey: false })

    expect(capturedCtx?.getAttachment).toBeDefined()
    expect(capturedCtx!.getAttachment!('richText')).toBeUndefined()
  })
})
