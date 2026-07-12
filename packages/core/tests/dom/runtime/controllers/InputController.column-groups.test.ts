import { describe, expect, it, mock } from 'bun:test'
import { InputController } from '../../../../src/dom/runtime/controllers/InputController'
import { makeMockGridEngine } from '../../../helpers/mock-grid-engine'
import type { WebHost } from '../../../../src/dom/host/Host'
import { denseGridTheme } from '@novasheet/core'
import type { Axis, GridEngine, RenderFrame } from '@novasheet/core'

/**
 * hit-test 分层场景：3 列（field-0/1/2），depth=1 组 s1 覆盖 view [1,2]，
 * col0 无组（伸满整表头，`leafTopRowByViewCol[0] = 0`）。
 * groupHeaderRowHeight=28、leafHeaderHeight(theme.headerHeight)=32 → headerHeight = 60。
 * 组行区 y ∈ [0,28)；叶行区 y ∈ [28,60)。
 */
const COL_WIDTH = 100
const GROUP_ROW_HEIGHT = denseGridTheme.metrics.groupHeaderRowHeight
const LEAF_HEADER_HEIGHT = denseGridTheme.metrics.headerHeight
const TOTAL_HEADER_HEIGHT = GROUP_ROW_HEIGHT + LEAF_HEADER_HEIGHT

function makeAxis(count: number, size: number): Axis {
  return {
    version: 0,
    getTotalSize: () => count * size,
    getCount: () => count,
    getDefaultSize: () => size,
    getSize: (index: number) => (index >= 0 && index < count ? size : 0),
    indexToPosition: (index: number) => Math.max(0, Math.min(index, count)) * size,
    positionToIndex: (position: number) =>
      Math.max(0, Math.min(count - 1, Math.floor(position / size))),
    getVisibleRange: () => [0, Math.max(-1, count - 1)],
  }
}

function makeGroupedFrame(): RenderFrame {
  const colCount = 3
  const rowCount = 5
  const colsAxis = makeAxis(colCount, COL_WIDTH)
  const rowsAxis = makeAxis(rowCount, denseGridTheme.metrics.rowHeight)
  const schema = {
    fields: Array.from({ length: colCount }, (_, index) => ({
      id: `field-${index}`,
      name: `Field ${index + 1}`,
      type: 'text' as const,
      width: COL_WIDTH,
    })),
  }
  return {
    data: {
      getRowCount: () => rowCount,
      getSchema: () => schema,
      getRows: () => [],
      getCell: () => null,
      subscribe: () => () => {},
    },
    theme: denseGridTheme,
    rowsAxis,
    colsAxis,
    viewport: {
      contentRect: { width: 400, height: 300 },
      headerHeight: TOTAL_HEADER_HEIGHT,
      leafHeaderHeight: LEAF_HEADER_HEIGHT,
      rowHeaderWidth: 0,
      scrollX: 0,
      scrollY: 0,
      version: 0,
      regions: [
        {
          id: 'main',
          rowBand: 'middle',
          colBand: 'center',
          rowRange: [0, rowCount - 1],
          colRange: [0, colCount - 1],
          rect: { x: 0, y: TOTAL_HEADER_HEIGHT, width: colCount * COL_WIDTH, height: 240 },
          scrollOffsetX: 0,
          scrollOffsetY: 0,
          zIndex: 0,
        },
      ],
    },
    collapsedRowGaps: [],
    collapsedColGaps: [],
    columnGroupHeader: {
      depth: 1,
      rows: [
        [
          {
            groupId: 's1',
            label: 'Group 1',
            startViewCol: 1,
            endViewCol: 2,
            selected: false,
          },
        ],
      ],
      // col0 无组：伸满（0）；col1/col2 属于 s1：叶头从 depth(1) 行起
      leafTopRowByViewCol: [0, 1, 1],
    },
  }
}

function makeCtl(frame: RenderFrame, over: Record<string, unknown> = {}) {
  const engine = makeMockGridEngine({
    overrides: { getFrame: mock(() => frame) } as Partial<GridEngine>,
  })
  const deps = {
    engine,
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
    getColsTotalSizeForFrame: () => 3 * COL_WIDTH,
    ...over,
  }
  return { ctl: new InputController(deps as never), deps }
}

describe('InputController — hitTestGroupHeader（组头行命中）', () => {
  it('组行 y、组列 x → 返回该组 groupId', () => {
    const { ctl } = makeCtl(makeGroupedFrame())
    const hit = ctl.hitTestGroupHeader({ x: 150, y: 10, shiftKey: false })
    expect(hit).toEqual({ groupId: 's1' })
  })

  it('组行 y、无组列（伸满列）x → null（该列该行无组 cell，落回叶头语义）', () => {
    const { ctl } = makeCtl(makeGroupedFrame())
    const hit = ctl.hitTestGroupHeader({ x: 50, y: 10, shiftKey: false })
    expect(hit).toBeNull()
  })

  it('叶头行 y（>= depth × groupHeaderRowHeight）→ null，不论 x', () => {
    const { ctl } = makeCtl(makeGroupedFrame())
    expect(ctl.hitTestGroupHeader({ x: 150, y: 45, shiftKey: false })).toBeNull()
    expect(ctl.hitTestGroupHeader({ x: 50, y: 45, shiftKey: false })).toBeNull()
  })

  it('无 columnGroupHeader（零成本路径）→ 恒返回 null', () => {
    const engine = makeMockGridEngine({ colCount: 3, colWidth: COL_WIDTH })
    const frame = engine.getFrame()
    const { ctl } = makeCtl(frame)
    const hit = ctl.hitTestGroupHeader({ x: 150, y: 5, shiftKey: false })
    expect(hit).toBeNull()
  })

  it('表头外 / 行号列内不命中', () => {
    const { ctl } = makeCtl(makeGroupedFrame())
    expect(ctl.hitTestGroupHeader({ x: 150, y: -1, shiftKey: false })).toBeNull()
    expect(ctl.hitTestGroupHeader({ x: 150, y: TOTAL_HEADER_HEIGHT, shiftKey: false })).toBeNull()
  })
})

describe('InputController — hitTestColumnHeader 分层（组头存在时仅叶头区/伸满列命中）', () => {
  it('组行 y、组列 x → null（属于组头而非该列自身叶头）', () => {
    const { ctl } = makeCtl(makeGroupedFrame())
    const hit = ctl.hitTestColumnHeader({ x: 150, y: 10, shiftKey: false })
    expect(hit).toBeNull()
  })

  it('组行 y、无组列（伸满列）x → 正常命中该列（伸满语义）', () => {
    const { ctl } = makeCtl(makeGroupedFrame())
    const hit = ctl.hitTestColumnHeader({ x: 50, y: 10, shiftKey: false })
    expect(hit).toEqual({ colIndex: 0, fieldId: 'field-0' })
  })

  it('叶头行 y → 正常命中，无论是否属于组', () => {
    const { ctl } = makeCtl(makeGroupedFrame())
    expect(ctl.hitTestColumnHeader({ x: 50, y: 45, shiftKey: false })).toEqual({
      colIndex: 0,
      fieldId: 'field-0',
    })
    expect(ctl.hitTestColumnHeader({ x: 150, y: 45, shiftKey: false })).toEqual({
      colIndex: 1,
      fieldId: 'field-1',
    })
  })

  it('无 columnGroupHeader 时行为不变（零成本路径，逐字节兼容既有测试）', () => {
    const engine = makeMockGridEngine({ colCount: 3, colWidth: COL_WIDTH })
    const frame = engine.getFrame()
    const { ctl } = makeCtl(frame)
    const hit = ctl.hitTestColumnHeader({ x: 50, y: 5, shiftKey: false })
    expect(hit).toEqual({ colIndex: 0, fieldId: 'field-0' })
  })
})

describe('InputController — pointer down 组头点击选组', () => {
  it('点击组行命中的组头：selectColumnGroup(groupId) + refresh，短路不进入 tryStartDrag', () => {
    const { ctl, deps } = makeCtl(makeGroupedFrame())
    ctl.handleHostPointerDown({ x: 150, y: 10, shiftKey: false, button: 0 })
    expect(deps.engine.selectColumnGroup).toHaveBeenCalledWith('s1')
    expect(deps.refresh).toHaveBeenCalled()
    expect(deps.tryStartDrag).not.toHaveBeenCalled()
  })

  it('点击叶头区（无组）：不调用 selectColumnGroup，落入 tryStartDrag', () => {
    const { ctl, deps } = makeCtl(makeGroupedFrame())
    ctl.handleHostPointerDown({ x: 150, y: 45, shiftKey: false, button: 0 })
    expect(deps.engine.selectColumnGroup).not.toHaveBeenCalled()
    expect(deps.tryStartDrag).toHaveBeenCalled()
  })

  it('列头菜单按钮命中优先于组头点击', () => {
    const { ctl, deps } = makeCtl(makeGroupedFrame(), {
      hitTestColumnHeaderMenuButton: () => ({ colIndex: 1 }),
    })
    ctl.handleHostPointerDown({ x: 150, y: 10, shiftKey: false, button: 0 })
    expect(deps.openColumnHeaderContextMenu).toHaveBeenCalledWith(1, expect.anything())
    expect(deps.engine.selectColumnGroup).not.toHaveBeenCalled()
  })
})
