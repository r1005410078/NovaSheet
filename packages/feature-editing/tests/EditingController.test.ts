import { describe, expect, it, mock } from 'bun:test'
import type { GridEngine } from '@novasheet/core'
import type { WebCellEditorRuntimeDeps } from '@novasheet/web'
import { EditingController } from '../src'
import { makeMockGridEngine } from './helpers/mock-grid-engine'

function editFrame(engine: GridEngine): void {
  engine.getFrame = mock(() => ({
    data: { getSchema: () => ({ fields: [{ id: 'name', name: 'Name', type: 'text', width: 100 }] }) } as never,
    theme: { metrics: { headerHeight: 32 }, colors: {} } as never,
    rowsAxis: { indexToPosition: () => 0, getSize: () => 28 } as never,
    colsAxis: { indexToPosition: () => 0, getSize: () => 100 } as never,
    viewport: {
      regions: [
        {
          id: 'main',
          rowBand: 'middle',
          colBand: 'center',
          rowRange: [0, 9],
          colRange: [0, 2],
          rect: { x: 0, y: 32, width: 300, height: 200 },
          scrollOffsetX: 0,
          scrollOffsetY: 0,
          zIndex: 10,
        },
      ],
    } as never,
    cellEdit: { cell: { rowIndex: 0, colIndex: 0 }, draft: '' },
    collapsedRowGaps: [],
    collapsedColGaps: [],
  })) as never
}

function makeDeps(over: Partial<WebCellEditorRuntimeDeps> = {}): {
  deps: WebCellEditorRuntimeDeps
  spies: { reveal: ReturnType<typeof mock>; custom: ReturnType<typeof mock>; paint: ReturnType<typeof mock> }
} {
  const spies = { reveal: mock(() => {}), custom: mock(() => false), paint: mock(() => {}) }
  const deps: WebCellEditorRuntimeDeps = {
    engine: makeMockGridEngine(),
    host: {} as never,
    autofitRows: mock(() => ({ changedRows: 0, skippedRows: 0 })),
    afterEngineMutation: mock(() => {}),
    refresh: mock(() => {}),
    revealActiveCell: spies.reveal,
    requestSyncPaint: spies.paint,
    isBlocked: () => false,
    tryCustomEditor: spies.custom,
    ...over,
  }
  return { deps, spies }
}

describe('EditingController', () => {
  it('open 经 engine.beginCellEdit 进入编辑并打开 DOM 编辑器', () => {
    const { deps, spies } = makeDeps()
    deps.engine.beginCellEdit = mock(() => true)
    editFrame(deps.engine)
    const controller = new EditingController(deps)
    const container = document.createElement('div')
    controller.attach(container)

    expect(controller.open({ rowIndex: 0, colIndex: 0 }, { selectAll: false })).toBe(true)
    expect(deps.engine.beginCellEdit).toHaveBeenCalled()
    expect(spies.paint).toHaveBeenCalled()
    expect(container.querySelector('[data-novasheet-cell-editor]')).toBeTruthy()
    controller.destroy()
  })

  it('isBlocked 时 open 返回 false 不起编', () => {
    const { deps } = makeDeps({ isBlocked: () => true })
    deps.engine.beginCellEdit = mock(() => true)
    const controller = new EditingController(deps)
    controller.attach(document.createElement('div'))
    expect(controller.open({ rowIndex: 0, colIndex: 0 }, {})).toBe(false)
    expect(deps.engine.beginCellEdit).not.toHaveBeenCalled()
    controller.destroy()
  })

  it('tryCustomEditor 接管时 open 返回 true 且不 beginCellEdit', () => {
    const { deps, spies } = makeDeps()
    spies.custom.mockImplementation(() => true)
    deps.engine.beginCellEdit = mock(() => true)
    const controller = new EditingController(deps)
    controller.attach(document.createElement('div'))
    expect(controller.open({ rowIndex: 0, colIndex: 0 }, {})).toBe(true)
    expect(deps.engine.beginCellEdit).not.toHaveBeenCalled()
    controller.destroy()
  })

  it('commitActive(true) 提交后下移并 revealActiveCell', () => {
    const { deps, spies } = makeDeps()
    deps.engine.isCellEditing = mock(() => true)
    deps.engine.commitCellEdit = mock(() => true)
    deps.engine.navigateSelection = mock(() => true)
    new EditingController(deps).commitActive(true)
    expect(deps.engine.commitCellEdit).toHaveBeenCalled()
    expect(deps.engine.navigateSelection).toHaveBeenCalledWith('ArrowDown', false)
    expect(spies.reveal).toHaveBeenCalled()
  })

  it('cancelActive 在未编辑时不调 engine.cancelCellEdit', () => {
    const { deps } = makeDeps()
    deps.engine.isCellEditing = mock(() => false)
    deps.engine.cancelCellEdit = mock(() => {})
    new EditingController(deps).cancelActive()
    expect(deps.engine.cancelCellEdit).not.toHaveBeenCalled()
  })
})
