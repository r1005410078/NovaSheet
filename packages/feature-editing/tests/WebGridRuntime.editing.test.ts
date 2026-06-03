import { describe, expect, it, mock } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import { WebGridRuntime, type WebHost, type WebRenderer } from '@novasheet/web'
import { installContextMenuFeature } from '@novasheet/feature-context-menu'
import { installEditingFeature } from '../src'
import { makeMockGridEngine } from './helpers/mock-grid-engine'

function makeContext() {
  const ctx = createSheetContext()
  installEditingFeature(ctx)
  installContextMenuFeature(ctx)
  return ctx
}

function makeHost(container: HTMLElement): WebHost {
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
    container,
  }
}

function makeRenderer(): WebRenderer {
  return {
    mount: mock(() => {}),
    resize: mock(() => {}),
    render: mock(() => {}),
    destroy: mock(() => {}),
  }
}

const KEY_X = { key: 'x', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false }

describe('WebGridRuntime × editing feature', () => {
  it('选中后直接键入：键盘入口委托 controller 经 engine 起编', () => {
    const engine = makeMockGridEngine()
    engine.getSelection = mock(() => ({
      activeCell: { rowIndex: 1, colIndex: 0 },
      anchorCell: { rowIndex: 1, colIndex: 0 },
      extentCell: { rowIndex: 1, colIndex: 0 },
      selectedRange: { startRow: 1, endRow: 1, startCol: 0, endCol: 0 },
    }))
    engine.beginCellEdit = mock(() => true)
    engine.updateCellEditDraft = mock(() => {})
    engine.getFrame = mock(() => ({
      data: { getSchema: () => ({ fields: [{ id: 'name', name: 'Name', type: 'text', width: 100 }] }) } as never,
      theme: { metrics: { headerHeight: 32 } } as never,
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
      cellEdit: { cell: { rowIndex: 1, colIndex: 0 }, draft: 'x' },
      collapsedRowGaps: [],
      collapsedColGaps: [],
    })) as never

    const container = document.createElement('div')
    const runtime = new WebGridRuntime({ engine, context: makeContext(), host: makeHost(container), renderer: makeRenderer() })

    expect(runtime.handleHostKeyDown(KEY_X)).toBe(true)
    expect(engine.beginCellEdit).toHaveBeenCalledWith({ rowIndex: 1, colIndex: 0 })
    expect(engine.updateCellEditDraft).toHaveBeenCalledWith('x')
    expect(engine.navigateSelection).not.toHaveBeenCalled()
    expect(container.querySelector('[data-novasheet-cell-editor]')).toBeTruthy()
    runtime.destroy()
  })

  it('合并单元格进入编辑时编辑器覆盖完整合并区域', () => {
    const engine = makeMockGridEngine()
    engine.getSelection = mock(() => ({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 1, colIndex: 1 },
      selectedRange: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
    }))
    engine.beginCellEdit = mock(() => true)
    engine.getFrame = mock(() => ({
      data: {
        getSchema: () => ({
          fields: [
            { id: 'name', name: 'Name', type: 'text', width: 100 },
            { id: 'role', name: 'Role', type: 'text', width: 100 },
          ],
        }),
      } as never,
      theme: { metrics: { headerHeight: 32 } } as never,
      rowsAxis: { indexToPosition: (i: number) => i * 28, getSize: () => 28 } as never,
      colsAxis: { indexToPosition: (i: number) => i * 100, getSize: () => 100 } as never,
      viewport: {
        regions: [
          {
            id: 'main',
            rowBand: 'middle',
            colBand: 'center',
            rowRange: [0, 1],
            colRange: [0, 1],
            rect: { x: 0, y: 32, width: 200, height: 200 },
            scrollOffsetX: 0,
            scrollOffsetY: 0,
            zIndex: 10,
          },
        ],
      } as never,
      cellEdit: { cell: { rowIndex: 0, colIndex: 0 }, draft: 'Alice' },
      mergeRegions: [
        { id: 'merge-1', range: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 }, anchor: { rowIndex: 0, colIndex: 0 } },
      ],
      collapsedRowGaps: [],
      collapsedColGaps: [],
    })) as never

    const container = document.createElement('div')
    const runtime = new WebGridRuntime({ engine, context: makeContext(), host: makeHost(container), renderer: makeRenderer() })

    expect(runtime.handleHostKeyDown(KEY_X)).toBe(true)
    // 文本格（含合并）一律多行编辑器；合并区 rows0-1×cols0-1 = (0,32,200,56)。
    const textarea = container.querySelector('textarea[data-novasheet-cell-editor]') as HTMLTextAreaElement
    expect(textarea.style.left).toBe('0px')
    expect(textarea.style.top).toBe('32px')
    expect(textarea.style.width).toBe('200px')
    expect(textarea.style.height).toBe('56px')
    expect(textarea.value).toBe('Alice')
    runtime.destroy()
  })

  it('右键菜单打开前先提交进行中的编辑', () => {
    const engine = makeMockGridEngine()
    engine.isCellEditing = mock(() => true)
    engine.commitCellEdit = mock(() => true)
    const container = document.createElement('div')
    const runtime = new WebGridRuntime({ engine, context: makeContext(), host: makeHost(container), renderer: makeRenderer() })
    runtime.handleHostContextMenu({ x: 50, y: 60, shiftKey: false, clientX: 50, clientY: 60 })

    expect(engine.commitCellEdit).toHaveBeenCalled()
    expect(document.querySelector('[data-novasheet-context-menu][data-open]')).not.toBeNull()
    runtime.destroy()
  })
})
