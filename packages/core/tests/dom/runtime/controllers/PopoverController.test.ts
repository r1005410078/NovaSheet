import { describe, expect, it, mock } from 'bun:test'
import { PopoverController } from '../../../../src/dom/runtime/controllers/PopoverController'
import type { GridEngine } from '../../../../src/engine/GridEngine'

function makeCtl(over: Partial<ConstructorParameters<typeof PopoverController>[0]> = {}) {
  return new PopoverController({
    engine: {} as unknown as GridEngine,
    getFilterLayer: () => undefined,
    onContextMenuAction: mock(() => {}),
    closeContextMenu: mock(() => {}),
    hideFillPreview: () => {},
    hideColumnReorderOverlay: () => {},
    ...over,
  })
}
const colCtx = { targetKind: 'columnHeader', field: { id: 'f1' }, colIndex: 0 } as never

describe('PopoverController — openFilterPopover', () => {
  it('未注入 popover 时回退 onContextMenuAction(filter-open)', () => {
    const onAction = mock(() => {})
    const ctl = makeCtl({ onContextMenuAction: onAction })
    ctl.openFilterPopover(colCtx, null)
    expect(onAction).toHaveBeenCalledWith('filter-open', colCtx)
  })

  it('注入 popover 后 open 并先关菜单', () => {
    const closeContextMenu = mock(() => {})
    const ctl = makeCtl({ closeContextMenu })
    const popover = { open: mock(() => {}), isOpen: () => false, applyTheme: () => {} }
    ctl.setFilterPopover(popover as never)
    ctl.openFilterPopover(colCtx, { clientX: 10, clientY: 20 })
    expect(closeContextMenu).toHaveBeenCalled()
    expect(popover.open).toHaveBeenCalled()
  })
})

describe('PopoverController — openRowHeightPopover / openColumnWidthPopover', () => {
  it('未注入 rowHeightPopover 时 no-op（不抛错也不暂存 ids）', () => {
    const ctl = makeCtl()
    ctl.openRowHeightPopover([2, 5], { clientX: 1, clientY: 2 })
    expect(ctl.getPendingRowHeightIds()).toEqual([])
  })

  it('注入 rowHeightPopover 后按 anchor 计算 triggerRect 并读取当前行高', () => {
    const engine = { getRowHeight: mock(() => 42) } as unknown as GridEngine
    const ctl = makeCtl({ engine })
    const popover = { open: mock(() => {}), close: mock(() => {}), destroy: mock(() => {}) }
    ctl.setRowHeightPopover(popover as never)
    ctl.openRowHeightPopover([3, 1], { clientX: 10, clientY: 20 })
    expect(ctl.getPendingRowHeightIds()).toEqual([3, 1])
    expect(engine.getRowHeight).toHaveBeenCalledWith(3)
    expect(popover.open).toHaveBeenCalledWith({ x: 10, y: 20, width: 0, height: 0 }, 42)
  })

  it('anchor 为 null 时 triggerRect 回退到 (100, 100)', () => {
    const engine = { getRowHeight: mock(() => 20) } as unknown as GridEngine
    const ctl = makeCtl({ engine })
    const popover = { open: mock(() => {}), close: mock(() => {}), destroy: mock(() => {}) }
    ctl.setRowHeightPopover(popover as never)
    ctl.openRowHeightPopover([1], null)
    expect(popover.open).toHaveBeenCalledWith({ x: 100, y: 100, width: 0, height: 0 }, 20)
  })

  it('fieldIds 为空时 no-op（不抛错也不暂存 ids）', () => {
    const ctl = makeCtl()
    ctl.openColumnWidthPopover([], { clientX: 1, clientY: 2 })
    expect(ctl.getPendingColumnWidthFieldIds()).toEqual([])
  })

  it('注入 columnWidthPopover 后按 anchor 计算 triggerRect 并读取当前列宽', () => {
    const engine = {
      getData: () => ({
        getSchema: () => ({ fields: [{ id: 'f1', width: 88 }, { id: 'f2', width: 60 }] }),
      }),
    } as unknown as GridEngine
    const ctl = makeCtl({ engine })
    const popover = { open: mock(() => {}), close: mock(() => {}), destroy: mock(() => {}) }
    ctl.setColumnWidthPopover(popover as never)
    ctl.openColumnWidthPopover(['f1'], { clientX: 5, clientY: 6 })
    expect(ctl.getPendingColumnWidthFieldIds()).toEqual(['f1'])
    expect(popover.open).toHaveBeenCalledWith({ x: 5, y: 6, width: 0, height: 0 }, 88)
  })
})

describe('PopoverController — misc', () => {
  it('isFilterPopoverOpen 未注入时返回 false，注入后委托 popover.isOpen()', () => {
    const ctl = makeCtl()
    expect(ctl.isFilterPopoverOpen()).toBe(false)
    const popover = { open: mock(() => {}), isOpen: () => true, applyTheme: () => {} }
    ctl.setFilterPopover(popover as never)
    expect(ctl.isFilterPopoverOpen()).toBe(true)
  })

  it('applyTheme 转发给已注入的 filterPopover', () => {
    const ctl = makeCtl()
    const applyTheme = mock(() => {})
    const popover = { open: mock(() => {}), isOpen: () => false, applyTheme }
    ctl.setFilterPopover(popover as never)
    const theme = { id: 'dark' } as never
    ctl.applyTheme(theme)
    expect(applyTheme).toHaveBeenCalledWith(theme)
  })

  it('handleFilterPopoverApply：未打开过 filter popover 时 no-op', () => {
    const filterLayer = { setSpec: mock(() => true), clear: mock(() => true) }
    const ctl = makeCtl({ getFilterLayer: () => filterLayer as never })
    ctl.handleFilterPopoverApply({ kind: 'is-not-empty' } as never)
    expect(filterLayer.setSpec).not.toHaveBeenCalled()
  })

  it('handleFilterPopoverApply(op)：设置对应 fieldId 的 spec，随后清空 pending fieldId', () => {
    const filterLayer = { getSpec: mock(() => null), setSpec: mock(() => true), clear: mock(() => true) }
    const ctl = makeCtl({ getFilterLayer: () => filterLayer as never })
    const popover = { open: mock(() => {}), isOpen: () => false, applyTheme: () => {} }
    ctl.setFilterPopover(popover as never)
    ctl.openFilterPopover(colCtx, null)
    const op = { kind: 'is-not-empty' } as never
    ctl.handleFilterPopoverApply(op)
    expect(filterLayer.setSpec).toHaveBeenCalledWith({ fieldId: 'f1', op })
    // 二次调用不应重复 setSpec（fieldId 已清空）
    ctl.handleFilterPopoverApply(op)
    expect(filterLayer.setSpec).toHaveBeenCalledTimes(1)
  })

  it('handleFilterPopoverApply(null)：清除对应 fieldId 的 filter', () => {
    const filterLayer = { getSpec: mock(() => null), setSpec: mock(() => true), clear: mock(() => true) }
    const ctl = makeCtl({ getFilterLayer: () => filterLayer as never })
    const popover = { open: mock(() => {}), isOpen: () => false, applyTheme: () => {} }
    ctl.setFilterPopover(popover as never)
    ctl.openFilterPopover(colCtx, null)
    ctl.handleFilterPopoverApply(null)
    expect(filterLayer.clear).toHaveBeenCalledWith('f1')
  })
})
