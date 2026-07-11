import { describe, expect, it, mock } from 'bun:test'
import { InputController } from '../../../../src/dom/runtime/controllers/InputController'
import { makeMockGridEngine } from '../../../helpers/mock-grid-engine'
import type { WebHost, WebKeyboardEvent } from '../../../../src/dom/host/Host'
import type { GridEngine } from '../../../../src/engine/GridEngine'

const activeCell = { rowIndex: 1, colIndex: 1 }

function makeKeyEvent(over: Partial<WebKeyboardEvent> & { key: string }): WebKeyboardEvent {
  return {
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...over,
  }
}

function makeCtl(
  over: Record<string, unknown> = {},
  engineOptions: Parameters<typeof makeMockGridEngine>[0] = {},
) {
  const deps = {
    engine: makeMockGridEngine(engineOptions),
    host: {
      setCursor: mock(() => {}),
      getContainerBoundingRect: () => ({ left: 0, top: 0 }),
      getContainerSize: () => ({ width: 400, height: 300 }),
    } as unknown as WebHost,
    isDestroyed: () => false,
    refresh: mock(() => {}),
    getRenderer: () => ({ getCellActionAt: () => null }) as never,
    tryStartDrag: mock(() => false),
    moveActiveDrag: mock(() => false),
    commitActiveDrag: mock(() => false),
    cancelActiveDrag: mock(() => false),
    isAnyDragActive: () => false,
    closeActiveCustomEditor: mock(() => {}),
    commitCellEdit: mock(() => {}),
    openCellEditorForTrigger: mock(() => false),
    hasCustomCellEditor: mock(() => false),
    invokeCellAction: mock(() => {}),
    clipboardCopy: mock(async () => true),
    clipboardCut: mock(async () => true),
    clipboardPaste: mock(async () => true),
    undo: mock(() => {}),
    redo: mock(() => {}),
    hitTestColumnHeaderMenuButton: () => null,
    openColumnHeaderContextMenu: mock(() => {}),
    updateHoveredColumnHeaderMenu: mock(() => {}),
    isFilterPopoverOpen: () => false,
    ensureCellVisible: mock(() => {}),
    getSelectionScrollTarget: () => null,
    getColsTotalSizeForFrame: () => 200,
    ...over,
  }
  return { ctl: new InputController(deps as never), deps }
}

describe('InputController — handleHostKeyDown 优先级链', () => {
  it('Escape 且存在活跃拖拽：cancelActiveDrag 吞事件，不再往下走', () => {
    const { ctl, deps } = makeCtl({ cancelActiveDrag: mock(() => true) })
    const handled = ctl.handleHostKeyDown(makeKeyEvent({ key: 'Escape' }))
    expect(handled).toBe(true)
    expect(deps.cancelActiveDrag).toHaveBeenCalled()
  })

  it('非 Escape 键不触碰 cancelActiveDrag（短路求值，不因 && 副作用误调用）', () => {
    const { ctl, deps } = makeCtl({ cancelActiveDrag: mock(() => true) })
    ctl.handleHostKeyDown(makeKeyEvent({ key: 'ArrowRight' }))
    expect(deps.cancelActiveDrag).not.toHaveBeenCalled()
  })

  it('filter popover 打开时不抢键盘（早于剪贴板/编辑判断）', () => {
    const { ctl, deps } = makeCtl({ isFilterPopoverOpen: () => true })
    const handled = ctl.handleHostKeyDown(makeKeyEvent({ key: 'c', ctrlKey: true }))
    expect(handled).toBe(false)
    expect(deps.clipboardCopy).not.toHaveBeenCalled()
  })

  it('cell 编辑态时不抢键盘', () => {
    const { ctl, deps } = makeCtl(
      {},
      { overrides: { isCellEditing: mock(() => true) } as Partial<GridEngine> },
    )
    const handled = ctl.handleHostKeyDown(makeKeyEvent({ key: 'c', ctrlKey: true }))
    expect(handled).toBe(false)
    expect(deps.clipboardCopy).not.toHaveBeenCalled()
  })

  it('Ctrl+C 走 clipboardCopy 并吞掉事件', () => {
    const { ctl, deps } = makeCtl()
    const handled = ctl.handleHostKeyDown(makeKeyEvent({ key: 'c', ctrlKey: true }))
    expect(handled).toBe(true)
    expect(deps.clipboardCopy).toHaveBeenCalled()
  })

  it('Cmd+C（Mac metaKey）同样走 clipboardCopy', () => {
    const { ctl, deps } = makeCtl()
    const handled = ctl.handleHostKeyDown(makeKeyEvent({ key: 'c', metaKey: true }))
    expect(handled).toBe(true)
    expect(deps.clipboardCopy).toHaveBeenCalled()
  })

  it('Ctrl+Shift+C 不抢（Shift 组合不算剪贴板快捷键）', () => {
    const { ctl, deps } = makeCtl()
    const handled = ctl.handleHostKeyDown(makeKeyEvent({ key: 'c', ctrlKey: true, shiftKey: true }))
    expect(handled).toBe(false)
    expect(deps.clipboardCopy).not.toHaveBeenCalled()
  })

  it('Ctrl+X 走 clipboardCut', () => {
    const { ctl, deps } = makeCtl()
    const handled = ctl.handleHostKeyDown(makeKeyEvent({ key: 'x', ctrlKey: true }))
    expect(handled).toBe(true)
    expect(deps.clipboardCut).toHaveBeenCalled()
  })

  it('Ctrl+V 走 clipboardPaste', () => {
    const { ctl, deps } = makeCtl()
    const handled = ctl.handleHostKeyDown(makeKeyEvent({ key: 'v', ctrlKey: true }))
    expect(handled).toBe(true)
    expect(deps.clipboardPaste).toHaveBeenCalled()
  })

  it('Ctrl+Z 且 canUndo() 为 true 时调用 undo', () => {
    const { ctl, deps } = makeCtl(
      {},
      { overrides: { canUndo: mock(() => true) } as Partial<GridEngine> },
    )
    const handled = ctl.handleHostKeyDown(makeKeyEvent({ key: 'z', ctrlKey: true }))
    expect(handled).toBe(true)
    expect(deps.undo).toHaveBeenCalled()
  })

  it('Ctrl+Z 且 canUndo() 为 false 时硬性早返回 false，不下探到导航分支', () => {
    const { ctl, deps } = makeCtl(
      {},
      {
        overrides: {
          canUndo: mock(() => false),
          navigateSelection: mock(() => true),
        } as Partial<GridEngine>,
      },
    )
    const handled = ctl.handleHostKeyDown(makeKeyEvent({ key: 'z', ctrlKey: true }))
    expect(handled).toBe(false)
    expect(deps.undo).not.toHaveBeenCalled()
    expect(deps.engine.navigateSelection).not.toHaveBeenCalled()
  })

  it('Ctrl+Y（非 Mac）且 canRedo() 为 true 时调用 redo', () => {
    const { ctl, deps } = makeCtl(
      {},
      { overrides: { canRedo: mock(() => true) } as Partial<GridEngine> },
    )
    const handled = ctl.handleHostKeyDown(makeKeyEvent({ key: 'y', ctrlKey: true }))
    expect(handled).toBe(true)
    expect(deps.redo).toHaveBeenCalled()
  })

  it('Cmd+Y（metaKey，非 ctrlKey）不触发 redo —— Mac 上 redo 只认 Cmd+Shift+Z', () => {
    const { ctl, deps } = makeCtl(
      {},
      { overrides: { canRedo: mock(() => true) } as Partial<GridEngine> },
    )
    const handled = ctl.handleHostKeyDown(makeKeyEvent({ key: 'y', metaKey: true }))
    expect(deps.redo).not.toHaveBeenCalled()
    expect(handled).toBe(false)
  })

  it('Ctrl+Shift+Z 走 redo（跨平台通用 redo 组合）', () => {
    const { ctl, deps } = makeCtl(
      {},
      { overrides: { canRedo: mock(() => true) } as Partial<GridEngine> },
    )
    const handled = ctl.handleHostKeyDown(makeKeyEvent({ key: 'z', ctrlKey: true, shiftKey: true }))
    expect(handled).toBe(true)
    expect(deps.redo).toHaveBeenCalled()
  })

  it('Cmd+Shift+Z 走 redo（Mac 惯例）', () => {
    const { ctl, deps } = makeCtl(
      {},
      { overrides: { canRedo: mock(() => true) } as Partial<GridEngine> },
    )
    const handled = ctl.handleHostKeyDown(makeKeyEvent({ key: 'z', metaKey: true, shiftKey: true }))
    expect(handled).toBe(true)
    expect(deps.redo).toHaveBeenCalled()
  })

  it('Ctrl+Shift+Z 且 canRedo() 为 false 时返回 false', () => {
    const { ctl, deps } = makeCtl(
      {},
      { overrides: { canRedo: mock(() => false) } as Partial<GridEngine> },
    )
    const handled = ctl.handleHostKeyDown(makeKeyEvent({ key: 'z', ctrlKey: true, shiftKey: true }))
    expect(handled).toBe(false)
    expect(deps.redo).not.toHaveBeenCalled()
  })

  it('F2 且有 activeCell 时调用 openCellEditorForTrigger(trigger: f2)', () => {
    const { ctl, deps } = makeCtl(
      { openCellEditorForTrigger: mock(() => true) },
      {
        selection: {
          activeCell,
          anchorCell: activeCell,
          extentCell: activeCell,
          selectedRange: null,
        },
      },
    )
    const handled = ctl.handleHostKeyDown(makeKeyEvent({ key: 'F2' }))
    expect(handled).toBe(true)
    expect(deps.openCellEditorForTrigger).toHaveBeenCalledWith({
      cell: activeCell,
      trigger: 'f2',
      selectAll: false,
    })
  })

  it('Enter 且命中 hasCustomCellEditor 时调用 openCellEditorForTrigger(trigger: enter)', () => {
    const { ctl, deps } = makeCtl(
      { hasCustomCellEditor: mock(() => true), openCellEditorForTrigger: mock(() => true) },
      {
        selection: {
          activeCell,
          anchorCell: activeCell,
          extentCell: activeCell,
          selectedRange: null,
        },
      },
    )
    const handled = ctl.handleHostKeyDown(makeKeyEvent({ key: 'Enter' }))
    expect(handled).toBe(true)
    expect(deps.openCellEditorForTrigger).toHaveBeenCalledWith({
      cell: activeCell,
      trigger: 'enter',
      selectAll: false,
    })
  })

  it('Enter 且无 custom editor 时不调用 openCellEditorForTrigger(trigger: enter)，落到导航', () => {
    const { ctl, deps } = makeCtl(
      { hasCustomCellEditor: mock(() => false) },
      {
        selection: {
          activeCell,
          anchorCell: activeCell,
          extentCell: activeCell,
          selectedRange: null,
        },
        overrides: { navigateSelection: mock(() => true) } as Partial<GridEngine>,
      },
    )
    const handled = ctl.handleHostKeyDown(makeKeyEvent({ key: 'Enter' }))
    expect(deps.openCellEditorForTrigger).not.toHaveBeenCalled()
    expect(handled).toBe(true)
    expect(deps.engine.navigateSelection).toHaveBeenCalledWith('Enter', false)
  })

  it('可打印单字符键（无修饰键）触发 typing-to-edit', () => {
    const { ctl, deps } = makeCtl(
      { openCellEditorForTrigger: mock(() => true) },
      {
        selection: {
          activeCell,
          anchorCell: activeCell,
          extentCell: activeCell,
          selectedRange: null,
        },
      },
    )
    const handled = ctl.handleHostKeyDown(makeKeyEvent({ key: 'a' }))
    expect(handled).toBe(true)
    expect(deps.openCellEditorForTrigger).toHaveBeenCalledWith({
      cell: activeCell,
      trigger: 'typing',
      initialInput: 'a',
      selectAll: false,
    })
  })

  it('普通导航键：navigateSelection 命中后 ensureCellVisible + refresh', () => {
    const target = { rowIndex: 2, colIndex: 1 }
    const { ctl, deps } = makeCtl(
      { getSelectionScrollTarget: () => target, ensureCellVisible: mock(() => {}) },
      { overrides: { navigateSelection: mock(() => true) } as Partial<GridEngine> },
    )
    const handled = ctl.handleHostKeyDown(makeKeyEvent({ key: 'ArrowDown' }))
    expect(handled).toBe(true)
    expect(deps.engine.navigateSelection).toHaveBeenCalledWith('ArrowDown', false)
    expect(deps.ensureCellVisible).toHaveBeenCalledWith(target)
    expect(deps.refresh).toHaveBeenCalled()
  })

  it('普通导航键：navigateSelection 未命中返回 false，不 refresh', () => {
    const { ctl, deps } = makeCtl(
      {},
      { overrides: { navigateSelection: mock(() => false) } as Partial<GridEngine> },
    )
    const handled = ctl.handleHostKeyDown(makeKeyEvent({ key: 'ArrowDown' }))
    expect(handled).toBe(false)
    expect(deps.refresh).not.toHaveBeenCalled()
  })

  it('destroyed 时立即返回 false', () => {
    const { ctl, deps } = makeCtl({ isDestroyed: () => true })
    const handled = ctl.handleHostKeyDown(makeKeyEvent({ key: 'c', ctrlKey: true }))
    expect(handled).toBe(false)
    expect(deps.clipboardCopy).not.toHaveBeenCalled()
  })
})

describe('InputController — handleHostPointerDown', () => {
  it('非左键（button !== 0）直接返回，不进入任何分支', () => {
    const { ctl, deps } = makeCtl()
    ctl.handleHostPointerDown({ x: 10, y: 10, shiftKey: false, button: 2 })
    expect(deps.closeActiveCustomEditor).not.toHaveBeenCalled()
    expect(deps.tryStartDrag).not.toHaveBeenCalled()
  })

  it('左键点击：关闭 custom editor，命中 cellAction 时 invokeCellAction 并短路，不 tryStartDrag', () => {
    const action = { rowIndex: 0, colIndex: 0, actionId: 'toggle' }
    const { ctl, deps } = makeCtl({
      getRenderer: () => ({ getCellActionAt: () => action }) as never,
    })
    ctl.handleHostPointerDown({ x: 10, y: 10, shiftKey: false, button: 0 })
    expect(deps.closeActiveCustomEditor).toHaveBeenCalled()
    expect(deps.invokeCellAction).toHaveBeenCalledWith(action)
    expect(deps.tryStartDrag).not.toHaveBeenCalled()
  })

  it('editing 态下先 commitCellEdit(false) 再继续', () => {
    const { ctl, deps } = makeCtl(
      {},
      { overrides: { isCellEditing: mock(() => true) } as Partial<GridEngine> },
    )
    ctl.handleHostPointerDown({ x: 10, y: 10, shiftKey: false, button: 0 })
    expect(deps.commitCellEdit).toHaveBeenCalledWith(false)
  })

  it('命中列头菜单按钮：打开菜单并短路，不 tryStartDrag', () => {
    const { ctl, deps } = makeCtl({
      hitTestColumnHeaderMenuButton: () => ({ colIndex: 3 }),
    })
    const event = { x: 10, y: 10, shiftKey: false, button: 0 }
    ctl.handleHostPointerDown(event)
    expect(deps.openColumnHeaderContextMenu).toHaveBeenCalledWith(3, event)
    expect(deps.tryStartDrag).not.toHaveBeenCalled()
  })

  it('无 cellAction / 无菜单命中：走 tryStartDrag', () => {
    const { ctl, deps } = makeCtl()
    ctl.handleHostPointerDown({ x: 10, y: 10, shiftKey: false, button: 0 })
    expect(deps.tryStartDrag).toHaveBeenCalled()
  })

  it('destroyed 时不做任何事', () => {
    const { ctl, deps } = makeCtl({ isDestroyed: () => true })
    ctl.handleHostPointerDown({ x: 10, y: 10, shiftKey: false, button: 0 })
    expect(deps.closeActiveCustomEditor).not.toHaveBeenCalled()
  })
})

describe('InputController — handleHostPointerMove / Up / DoubleClick', () => {
  it('活跃拖拽消费了 move 时短路，不再算 header cursor', () => {
    const { ctl, deps } = makeCtl({
      moveActiveDrag: mock(() => true),
      host: { setCursor: mock(() => {}) } as unknown as WebHost,
    })
    ctl.handleHostPointerMove({ x: 10, y: 10, shiftKey: false })
    expect(deps.host.setCursor).not.toHaveBeenCalled()
    expect(deps.updateHoveredColumnHeaderMenu).not.toHaveBeenCalled()
  })

  it('无活跃拖拽时更新 hover 列头菜单', () => {
    const { ctl, deps } = makeCtl()
    ctl.handleHostPointerMove({ x: 10, y: 10, shiftKey: false })
    expect(deps.updateHoveredColumnHeaderMenu).toHaveBeenCalled()
  })

  it('pointerUp 转发给 commitActiveDrag', () => {
    const { ctl, deps } = makeCtl()
    ctl.handleHostPointerUp()
    expect(deps.commitActiveDrag).toHaveBeenCalled()
  })

  it('双击命中单元格：selectCell + openCellEditorForTrigger(trigger: double-click)', () => {
    const { ctl, deps } = makeCtl({ openCellEditorForTrigger: mock(() => true) })
    ctl.handleHostDoubleClick({ x: 8, y: 44, shiftKey: false })
    expect(deps.engine.selectCell).toHaveBeenCalled()
    expect(deps.openCellEditorForTrigger).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'double-click', selectAll: false }),
    )
  })

  it('双击时若有活跃拖拽则直接忽略', () => {
    const { ctl, deps } = makeCtl({ isAnyDragActive: () => true })
    ctl.handleHostDoubleClick({ x: 8, y: 44, shiftKey: false })
    expect(deps.openCellEditorForTrigger).not.toHaveBeenCalled()
  })
})

describe('InputController — 表头命中测试 / 整行整列选择', () => {
  it('hitTestColumnHeader 在表头范围内命中列', () => {
    const { ctl } = makeCtl({ getColsTotalSizeForFrame: () => 200 })
    const hit = ctl.hitTestColumnHeader({ x: 50, y: 5, shiftKey: false })
    expect(hit).toEqual({ colIndex: 0, fieldId: 'field-0' })
  })

  it('hitTestColumnHeader 表头外(y 超出 headerHeight)不命中', () => {
    const { ctl } = makeCtl()
    const hit = ctl.hitTestColumnHeader({ x: 50, y: 999, shiftKey: false })
    expect(hit).toBeNull()
  })

  it('hitTestRowHeader 无 rowHeaderWidth（默认 0）时不命中', () => {
    const { ctl } = makeCtl()
    const hit = ctl.hitTestRowHeader({ x: 5, y: 50, shiftKey: false })
    expect(hit).toBeNull()
  })

  it('isWholeColumnSelection：起止行覆盖整表行数时为 true', () => {
    const { ctl } = makeCtl({}, { rowCount: 10 })
    expect(ctl.isWholeColumnSelection({ startRow: 0, endRow: 9, startCol: 0, endCol: 0 })).toBe(
      true,
    )
    expect(ctl.isWholeColumnSelection({ startRow: 0, endRow: 5, startCol: 0, endCol: 0 })).toBe(
      false,
    )
  })

  it('isWholeRowSelection：起止列覆盖整表列数时为 true', () => {
    const { ctl } = makeCtl({}, { colCount: 2 })
    expect(ctl.isWholeRowSelection({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 })).toBe(true)
    expect(ctl.isWholeRowSelection({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 })).toBe(false)
  })

  it('selectWholeColumn 委托 selectWholeColumnRange(col, col)', () => {
    const { ctl, deps } = makeCtl({}, { rowCount: 5 })
    ctl.selectWholeColumn(1)
    expect(deps.engine.setSelection).toHaveBeenCalledWith({
      activeCell: { rowIndex: 0, colIndex: 1 },
      anchorCell: { rowIndex: 0, colIndex: 1 },
      extentCell: { rowIndex: 4, colIndex: 1 },
      selectedRange: { startRow: 0, endRow: 4, startCol: 1, endCol: 1 },
    })
  })

  it('selectWholeRowRange 按 anchor/extent 排序生成 selectedRange', () => {
    const { ctl, deps } = makeCtl({}, { colCount: 2 })
    ctl.selectWholeRowRange(3, 1)
    expect(deps.engine.setSelection).toHaveBeenCalledWith({
      activeCell: { rowIndex: 1, colIndex: 0 },
      anchorCell: { rowIndex: 3, colIndex: 0 },
      extentCell: { rowIndex: 1, colIndex: 1 },
      selectedRange: { startRow: 1, endRow: 3, startCol: 0, endCol: 1 },
    })
  })
})
