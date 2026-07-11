import { describe, expect, it, mock } from 'bun:test'
import { CellEditController } from '../../../../src/dom/runtime/controllers/CellEditController'
import { InMemoryDataSource } from '../../../../src/kernel/data/InMemoryDataSource'
import type { CellEditorOpenContext } from '../../../../src/dom/interaction/CellEditorContract'
import type { Field, Row } from '../../../../src/kernel/data/Schema'
import type { GridEngine } from '../../../../src/engine/GridEngine'
import { makeMockGridEngine } from '../../../helpers/mock-grid-engine'

/** 单字段 'assignee' 自定义类型 engine：owner 列供 openCellEditor 打开自定义编辑器测试。 */
function makeAssigneeEngine(fields: Field[], rows: readonly Row[]) {
  const data = new InMemoryDataSource({ rows: [...rows], schema: { fields } })
  return makeMockGridEngine({ data, rowCount: rows.length, colCount: fields.length })
}

function makeCtl(over: {
  engine?: GridEngine
  cellEditors?: Record<string, unknown>
  deps?: Record<string, unknown>
} = {}) {
  const engine = over.engine ?? makeMockGridEngine()
  const deps = {
    engine,
    editorContainer: document.createElement('div'),
    isDestroyed: () => false,
    refresh: mock(() => {}),
    paintSync: mock(() => {}),
    afterEngineMutation: mock(() => {}),
    ensureCellVisible: mock(() => {}),
    getSelectionScrollTarget: () => null,
    autofitRows: mock(() => ({ changedRows: 0, skippedRows: 0 })),
    // `openCellEditorForTrigger` 原体读 `this.resizeDrag.active`；resizeDrag 仍属
    // GridRuntime（Task 8 DragCoordinator 前），brief 深依赖清单缺此字段，按
    // "缺 deps 则补一条" 规则补上（详见 task-7-report.md 自评）。
    isResizeDragActive: () => false,
    ...over.deps,
  }
  const ctl = new CellEditController({
    cellEditors: (over.cellEditors as never) ?? {},
    cellTypes: {},
    deps,
  })
  return { ctl, deps, engine }
}

describe('CellEditController', () => {
  it('augmentFrame 在自定义编辑激活且 frame 无 cellEdit 时合并会话', () => {
    const { ctl } = makeCtl()
    const frame = { cellEdit: undefined } as never
    // 未激活自定义编辑:原样返回
    expect(ctl.augmentFrame(frame)).toBe(frame)
  })

  it('非编辑态 cancelCellEdit 只关编辑器不触发 mutation 收尾', () => {
    const { ctl, deps, engine } = makeCtl()
    ;(engine.isCellEditing as unknown as ReturnType<typeof mock>).mockReturnValue(false)
    const editor = { open: mock(() => {}), close: mock(() => {}), isOpen: () => false, applyTheme: () => {} }
    ctl.setCellEditor(editor as never)
    ctl.cancelCellEdit()
    expect(editor.close).toHaveBeenCalled()
    expect(deps.afterEngineMutation).not.toHaveBeenCalled()
  })

  it('augmentFrame 在自定义编辑器激活时把 cellEdit 会话合并进无 cellEdit 的 frame', () => {
    const fields: Field[] = [{ id: 'owner', name: 'Owner', type: 'assignee', width: 100 }]
    const engine = makeAssigneeEngine(fields, [{ owner: 'Ada' }])
    const editor = { open: mock((ctx: CellEditorOpenContext) => void ctx), close: mock(() => {}) }
    const { ctl } = makeCtl({ engine, cellEditors: { assignee: editor } })

    expect(ctl.openCellEditor(0, 'owner')).toBe(true)

    const bareFrame = { cellEdit: undefined } as never
    const augmented = ctl.augmentFrame(bareFrame)
    expect(augmented).not.toBe(bareFrame)
    expect(augmented.cellEdit).toEqual({
      cell: { rowIndex: 0, colIndex: 0 },
      fieldId: 'owner',
      fieldType: 'assignee',
      draft: 'Ada',
    })

    // frame 已带 cellEdit 时不覆盖(引擎自身编辑会话优先)
    const framedWithEdit = { cellEdit: { cell: { rowIndex: 1, colIndex: 0 } } } as never
    expect(ctl.augmentFrame(framedWithEdit)).toBe(framedWithEdit)
  })

  it('token 竞态守卫:reopen 后旧 ctx 的 commit/cancel 是 no-op,当前 ctx 仍可提交', () => {
    const fields: Field[] = [
      { id: 'owner', name: 'Owner', type: 'assignee', width: 100 },
      { id: 'reviewer', name: 'Reviewer', type: 'assignee', width: 100 },
    ]
    const engine = makeAssigneeEngine(fields, [{ owner: 'Ada', reviewer: 'Grace' }])
    engine.commitCellValue = mock(() => true)
    const contexts: CellEditorOpenContext[] = []
    const editor = {
      open: mock((ctx: CellEditorOpenContext) => contexts.push(ctx)),
      close: mock(() => {}),
    }
    const { ctl } = makeCtl({ engine, cellEditors: { assignee: editor } })

    expect(ctl.openCellEditor(0, 'owner')).toBe(true)
    const staleCtx = contexts[0]!
    expect(ctl.openCellEditor(0, 'reviewer')).toBe(true)
    const currentCtx = contexts[1]!

    // 旧会话(owner)的异步回调在 reviewer 会话已开启后才触发——必须是 no-op
    staleCtx.commit('Stale owner')
    staleCtx.cancel()

    expect(engine.commitCellValue).not.toHaveBeenCalled()
    expect(editor.close).toHaveBeenCalledTimes(1) // 仅来自 reopen 时的 closeActiveCustomEditor

    // 当前会话(reviewer)仍可正常提交
    currentCtx.commit('Current reviewer')

    expect(engine.commitCellValue).toHaveBeenCalledTimes(1)
    expect(engine.commitCellValue).toHaveBeenCalledWith(
      { rowIndex: 0, colIndex: 1 },
      'reviewer',
      'Current reviewer',
    )
    expect(editor.close).toHaveBeenCalledTimes(2)
  })

  it('resize drag 激活时 openCellEditorForTrigger 直接返回 false(不咨询 custom/内建编辑器)', () => {
    const { ctl, deps } = makeCtl({ deps: { isResizeDragActive: () => true } })
    expect(
      ctl.openCellEditorForTrigger({
        cell: { rowIndex: 0, colIndex: 0 },
        trigger: 'api',
        selectAll: false,
      }),
    ).toBe(false)
    void deps
  })

  it('destroy():关当前自定义编辑器+内建编辑器,并销毁注册表内全部编辑器实例', () => {
    const editorA = { open: mock(() => {}), close: mock(() => {}), destroy: mock(() => {}) }
    const editorB = { open: mock(() => {}), close: mock(() => {}), destroy: mock(() => {}) }
    const { ctl } = makeCtl({ cellEditors: { assignee: editorA, taskStatus: editorB } })
    const domEditor = {
      open: mock(() => {}),
      close: mock(() => {}),
      isOpen: () => false,
      applyTheme: mock(() => {}),
    }
    ctl.setCellEditor(domEditor as never)

    ctl.destroy()

    expect(domEditor.close).toHaveBeenCalled()
    expect(editorA.destroy).toHaveBeenCalledTimes(1)
    expect(editorB.destroy).toHaveBeenCalledTimes(1)
  })
})
