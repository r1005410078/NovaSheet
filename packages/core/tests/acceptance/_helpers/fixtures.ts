import {
  ChunkedAxis,
  Grid,
  InMemoryDataSource,
  FrozenRegions,
  Viewport,
  denseGridTheme,
  type CellAttachmentCodec,
  type CellRange,
  type CellEditorRegistry,
  type ExcelWorkspacePort,
  type GridEngineFrameSource,
  type GridSelection,
  type PasteSkippedCell,
  type RenderBackend,
  type RenderBackendFactory,
  type RenderBackendHandle,
  type RenderFrame,
  type Row,
  type Schema,
  type TextMeasurer,
} from '../../../src'

export const schema: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 120 },
    { id: 'score', name: 'Score', type: 'number', width: 80 },
  ],
}

export function createDenseData(): InMemoryDataSource {
  return new InMemoryDataSource({
    schema,
    rows: [
      { name: 'Ada', score: 10 },
      { name: 'Grace', score: 20 },
    ] satisfies Row[],
  })
}

export const mutableSchema: Schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text', width: 100 },
    { id: 'b', name: 'B', type: 'number', width: 80, defaultValue: 0 },
    { id: 'c', name: 'C', type: 'text', width: 100 },
    { id: 'd', name: 'D', type: 'text', width: 100 },
  ],
}

export function createMutableData(): InMemoryDataSource {
  return new InMemoryDataSource({
    schema: mutableSchema,
    rows: [
      { a: 'r0', b: 10, c: 'c0', d: 'd0' },
      { a: 'r1', b: 20, c: 'c1', d: 'd1' },
      { a: 'r2', b: 30, c: 'c2', d: 'd2' },
    ] satisfies Row[],
  })
}
const noopMeasurer: TextMeasurer = {
  measureWidth: (text) => text.length * 7,
}

interface RenderRecorder {
  frames: RenderFrame[]
  destroyCalls: number
}

export function mountRecordingGrid(
  options: {
    data?: InMemoryDataSource
    onColumnsMoved?: (event: { fieldIds: readonly string[]; beforeFieldId: string | null }) => void
    onCopy?: (range: CellRange) => void
    onCut?: (range: CellRange) => void
    onPaste?: (range: CellRange) => void
    onPasteSkipped?: (cells: readonly PasteSkippedCell[]) => void
    cellEditors?: CellEditorRegistry
    cellAttachments?: readonly CellAttachmentCodec<unknown>[]
  } = {},
): {
  container: HTMLElement
  grid: Grid
  recorder: RenderRecorder
} {
  const container = document.createElement('div')
  Object.assign(container.style, { width: '400px', height: '300px' })
  document.body.appendChild(container)
  const { backend, recorder } = createRecordingBackend()
  const grid = new Grid(container, {
    data: options.data ?? createDenseData(),
    backend,
    onColumnsMoved: options.onColumnsMoved,
    onCopy: options.onCopy,
    onCut: options.onCut,
    onPaste: options.onPaste,
    onPasteSkipped: options.onPasteSkipped,
    cellEditors: options.cellEditors,
    cellAttachments: options.cellAttachments,
  })
  return { container, grid, recorder }
}

export function createRecordingBackend(): {
  backend: RenderBackendFactory
  recorder: RenderRecorder
} {
  const recorder: RenderRecorder = { frames: [], destroyCalls: 0 }
  const backend: RenderBackendFactory = (): RenderBackendHandle => {
    let renderer = createRecordingRenderer(recorder)
    return {
      renderer,
      measurer: noopMeasurer,
      createRenderer(_engine: GridEngineFrameSource): RenderBackend {
        renderer = createRecordingRenderer(recorder)
        return renderer
      },
      resizeSurface(_width: number, _height: number): void {},
      destroy(): void {
        renderer.destroy()
      },
    }
  }
  return { backend, recorder }
}

export function createRecordingRenderer(recorder: RenderRecorder): RenderBackend {
  return {
    mount(_container: HTMLElement): void {},
    resize(_width: number, _height: number, _dpr: number): void {},
    render(frame: RenderFrame): void {
      recorder.frames.push(frame)
    },
    destroy(): void {
      recorder.destroyCalls += 1
    },
  }
}

export function lastFrame(recorder: RenderRecorder): RenderFrame {
  const frame = recorder.frames.at(-1)
  if (frame === undefined) throw new Error('expected at least one render frame')
  return frame
}

export function withManualRaf<T>(run: (flushRaf: () => void) => T): T {
  const original = globalThis.requestAnimationFrame
  const callbacks: FrameRequestCallback[] = []
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
    callbacks.push(callback)
    return callbacks.length
  }) as typeof requestAnimationFrame
  const flushRaf = () => {
    while (callbacks.length > 0) callbacks.shift()!(0)
  }
  try {
    return run(flushRaf)
  } finally {
    globalThis.requestAnimationFrame = original
  }
}

export function getScrollHost(container: HTMLElement): HTMLElement {
  const scrollHost = container.querySelector<HTMLElement>('[data-novasheet-scroll-host]')
  if (scrollHost === null) throw new Error('expected Grid scroll host')
  return scrollHost
}

export function createScrollData(): InMemoryDataSource {
  return new InMemoryDataSource({
    schema,
    rows: Array.from({ length: 50 }, (_, index) => ({
      name: `row ${index}`,
      score: index,
    })) satisfies Row[],
  })
}

export function createWrapData(): InMemoryDataSource {
  return new InMemoryDataSource({
    schema: {
      fields: [
        { id: 'notes', name: 'Notes', type: 'text', width: 44, wrap: true },
        { id: 'score', name: 'Score', type: 'number', width: 80 },
      ],
    },
    rows: [
      {
        notes: 'alpha beta gamma delta epsilon zeta',
        score: 1,
      },
    ] satisfies Row[],
  })
}

export function rowOrder(data: InMemoryDataSource): string[] {
  return data.getRows(0, data.getRowCount() - 1).map((row) => String(row.a))
}

export function schemaFieldIds(source: { getSchema(): Schema }): string[] {
  return source.getSchema().fields.map((field) => field.id)
}

export function singleCellSelection(rowIndex: number, colIndex: number): GridSelection {
  return {
    activeCell: { rowIndex, colIndex },
    anchorCell: { rowIndex, colIndex },
    extentCell: { rowIndex, colIndex },
    selectedRange: {
      startRow: rowIndex,
      endRow: rowIndex,
      startCol: colIndex,
      endCol: colIndex,
    },
  }
}

export const createNoopBackend: RenderBackendFactory = (): RenderBackendHandle => {
  let renderer = createNoopRenderer()
  return {
    renderer,
    measurer: noopMeasurer,
    createRenderer(_engine: GridEngineFrameSource): RenderBackend {
      renderer = createNoopRenderer()
      return renderer
    },
    resizeSurface(_width: number, _height: number): void {},
    destroy(): void {
      renderer.destroy()
    },
  }
}

export function createWorkspacePort(): ExcelWorkspacePort & {
  appendedRows: number
  size: { rowCount: number; colCount: number }
} {
  const port = {
    appendedRows: 0,
    size: { rowCount: 100, colCount: 10 },
    getSize() {
      return this.size
    },
    getVisibleRange() {
      return { rows: [92, 99], cols: [0, 4] } as const
    },
    getContentBounds() {
      return { startRow: 0, endRow: 98, startCol: 0, endCol: 3 }
    },
    hasMaterializedRows(_start: number, _end: number) {
      return true
    },
    hasMaterializedCols(_start: number, _end: number) {
      return false
    },
    appendRows(count: number) {
      this.appendedRows += count
      this.size = { ...this.size, rowCount: this.size.rowCount + count }
    },
    appendCols(count: number) {
      this.size = { ...this.size, colCount: this.size.colCount + count }
    },
    resizeWorkspace(size: { rowCount: number; colCount: number }) {
      this.size = size
    },
  }
  return port
}

export function createNoopRenderer(): RenderBackend {
  return {
    mount(_container: HTMLElement): void {},
    resize(_width: number, _height: number, _dpr: number): void {},
    render(_frame: RenderFrame): void {},
    destroy(): void {},
  }
}

export function setNavigatorClipboard(clipboard: unknown): void {
  Object.defineProperty(navigator, 'clipboard', {
    value: clipboard,
    configurable: true,
    writable: true,
  })
}

export function createClipboardStub(initial = ''): {
  install: () => void
  getText: () => string
  setText: (value: string) => void
} {
  let text = initial
  return {
    install() {
      setNavigatorClipboard({
        writeText: async (value: string) => {
          text = value
        },
        readText: async () => text,
      })
    },
    getText: () => text,
    setText: (value: string) => {
      text = value
    },
  }
}

export function createHitTestFrame(): RenderFrame {
  const hitTestSchema: Schema = {
    fields: [
      { id: 'name', name: 'Name', type: 'text', width: 100 },
      { id: 'age', name: 'Age', type: 'number', width: 100 },
      { id: 'role', name: 'Role', type: 'text', width: 100 },
    ],
  }
  const data = new InMemoryDataSource({
    schema: hitTestSchema,
    rows: [
      { name: 'Alice', age: 30, role: 'Engineer' },
      { name: 'Bob', age: 25, role: 'Designer' },
      { name: 'Carol', age: 40, role: 'PM' },
      { name: 'Dave', age: 35, role: 'QA' },
    ] satisfies Row[],
  })
  const rowsAxis = new ChunkedAxis({
    count: data.getRowCount(),
    defaultSize: denseGridTheme.metrics.rowHeight,
  })
  const colsAxis = new ChunkedAxis({ count: hitTestSchema.fields.length, defaultSize: 100 })
  const frozen = new FrozenRegions(rowsAxis, colsAxis, { topRows: 1, leftCols: 1, rightCols: 1 })
  const viewport = new Viewport(rowsAxis, colsAxis, frozen)
  viewport.setHeaderHeight(denseGridTheme.metrics.headerHeight)
  viewport.setSize(300, 144)
  viewport.setScroll(100, 56)

  return {
    data,
    theme: denseGridTheme,
    rowsAxis,
    colsAxis,
    viewport: viewport.snapshot(),
    collapsedRowGaps: [],
    collapsedColGaps: [],
  }
}

export function fillRange(
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
): CellRange {
  return { startRow, endRow, startCol, endCol }
}
