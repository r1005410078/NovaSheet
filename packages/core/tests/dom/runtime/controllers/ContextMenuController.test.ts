import { describe, expect, it, mock } from 'bun:test'
import { ContextMenuController } from '../../../../src/dom/runtime/controllers/ContextMenuController'
import type { GridEngine } from '../../../../src/engine/GridEngine'
import type { WebHost } from '../../../../src/dom/host/Host'

function makeCtl(over: Record<string, unknown> = {}) {
  const engine = {
    getSelection: () => ({ selectedRange: { startRow: 1, endRow: 2, startCol: 0, endCol: 0 } }),
    getData: () => ({ resolveUnderlyingRow: (r: number) => r, getSchema: () => ({ fields: [{ id: 'a' }] }) }),
    getHiddenRows: () => [],
  } as unknown as GridEngine
  const deps = {
    engine,
    host: {} as unknown as WebHost,
    isDestroyed: () => false,
    invalidate: () => {},
    afterEngineMutation: () => {},
    getViewPipeline: () => undefined,
    getSortLayer: () => undefined,
    getFilterLayer: () => undefined,
    getContextMenus: () => undefined,
    isDragActive: () => false,
    isCellEditing: () => false,
    commitCellEdit: () => {},
    hitTestColumnHeader: () => null,
    clipboardCopy: mock(async () => true),
    clipboardCut: mock(async () => true),
    clipboardPaste: mock(async () => true),
    openFilterPopover: mock(() => {}),
    openRowHeightPopover: mock(() => {}),
    openColumnWidthPopover: mock(() => {}),
    insertRows: mock(() => [] as number[]),
    deleteRows: mock(() => {}),
    hideRows: mock(() => {}),
    unhideRows: mock(() => {}),
    insertCols: mock(() => []),
    deleteCols: mock(() => {}),
    hideCols: mock(() => {}),
    unhideCols: mock(() => {}),
    ...over,
  }
  return { ctl: new ContextMenuController(deps as never), deps }
}

describe('ContextMenuController — 行头动作', () => {
  it('hide-rows 以选区底层行 id(sorted-unique)调 deps.hideRows', () => {
    const { ctl, deps } = makeCtl()
    ctl.invokeRowHeaderContextMenuAction('hide-rows', { targetRowIndex: 1 })
    expect(deps.hideRows).toHaveBeenCalledWith([1, 2])
  })

  it('insert-above 以选区首行与行数调 deps.insertRows', () => {
    const { ctl, deps } = makeCtl()
    ctl.invokeRowHeaderContextMenuAction('insert-above', { targetRowIndex: 1 })
    expect(deps.insertRows).toHaveBeenCalledWith(1, 2)
  })
})
