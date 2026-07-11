import { describe, expect, it, mock } from 'bun:test'
import { createExcelWorkspacePort } from '../../../../src/dom/runtime/controllers/ExcelWorkspaceBinding'
import type { GridEngine } from '../../../../src/engine/GridEngine'

function makeEngineStub() {
  const data = {
    getRowCount: () => 10,
    getSchema: () => ({ fields: [{ id: 'a' }, { id: 'b' }] }),
  }
  return {
    getData: () => data,
    resizeExcelWorkspace: mock(() => true),
  } as unknown as GridEngine
}

describe('ExcelWorkspaceBinding — port', () => {
  it('appendRows 经 engine.resizeExcelWorkspace 扩容并标记 mutated', () => {
    const engine = makeEngineStub()
    const markMutated = mock(() => {})
    const port = createExcelWorkspacePort({ engine, markMutated })
    port.appendRows(3)
    expect(engine.resizeExcelWorkspace).toHaveBeenCalledWith({ rowCount: 13, colCount: 2 })
    expect(markMutated).toHaveBeenCalledTimes(1)
  })

  it('appendRows(0) 与 resize 失败时不标记 mutated', () => {
    const engine = makeEngineStub()
    ;(engine.resizeExcelWorkspace as unknown as ReturnType<typeof mock>).mockReturnValue(false)
    const markMutated = mock(() => {})
    const port = createExcelWorkspacePort({ engine, markMutated })
    port.appendRows(0)
    port.appendRows(2)
    expect(markMutated).not.toHaveBeenCalled()
  })
})
