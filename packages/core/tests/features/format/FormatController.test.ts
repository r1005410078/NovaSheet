import { describe, expect, it } from 'bun:test'
import { FormatController } from '../../../src/features/format/FormatController'
import type { FormatControllerContext } from '../../../src/features/format/FormatController'
import { DefaultFormatState } from '../../../src/features/format/FormatState'
import type { UndoCommand } from '../../../src/kernel/undo/UndoCommand'
import type { CellRange, GridSelection } from '../../../src/kernel/coords/SelectionTypes'
import { asRawRange } from '../../../src/kernel/coords/coordinates'

const EMPTY_SELECTION: GridSelection = {
  activeCell: null,
  anchorCell: null,
  extentCell: null,
  selectedRange: null,
}

/** 默认恒等 view→raw 翻译；捕获 pushUndo 与 selectRange 调用。 */
function makeCtx(overrides: Partial<FormatControllerContext> = {}): {
  ctx: FormatControllerContext
  pushed: UndoCommand[]
  selected: CellRange[]
} {
  const pushed: UndoCommand[] = []
  const selected: CellRange[] = []
  const ctx: FormatControllerContext = {
    translateRange: (range) => asRawRange({ ...range }),
    pushUndo: (command) => pushed.push(command),
    getSelection: () => EMPTY_SELECTION,
    selectRange: (range) => selected.push(range),
    ...overrides,
  }
  return { ctx, pushed, selected }
}

function makeController(overrides: Partial<FormatControllerContext> = {}): {
  formatState: DefaultFormatState
  fc: FormatController
  ctx: FormatControllerContext
  pushed: UndoCommand[]
  selected: CellRange[]
} {
  const formatState = new DefaultFormatState()
  const { ctx, pushed, selected } = makeCtx(overrides)
  const fc = new FormatController(formatState, ctx)
  return { formatState, fc, ctx, pushed, selected }
}

const range = (sr: number, er: number, sc: number, ec: number): CellRange => ({
  startRow: sr,
  endRow: er,
  startCol: sc,
  endCol: ec,
})

describe('FormatController — format', () => {
  it('setFillColor 写入并入栈 format 命令', () => {
    const { fc, pushed } = makeController()
    expect(fc.setFillColor(range(0, 1, 0, 1), '#f00')).toBe(true)
    expect(pushed).toHaveLength(1)
    expect(pushed[0]!.kind).toBe('format')
  })

  it('翻译失败（非连续映射）→ false，不入栈', () => {
    const { fc, pushed } = makeController({ translateRange: () => null })
    expect(fc.setFillColor(range(0, 1, 0, 1), '#f00')).toBe(false)
    expect(pushed).toHaveLength(0)
  })

  it('无副作用（快照前后一致）→ false，不入栈', () => {
    const { fc, pushed } = makeController()
    // 空 store 上清除填充：无层命中，快照不变
    expect(fc.setFillColor(range(0, 1, 0, 1), null)).toBe(false)
    expect(pushed).toHaveLength(0)
  })

  it('setBorders 校验：非 clear 但 border 为 null → false', () => {
    const { fc, pushed } = makeController()
    expect(fc.setBorders(range(0, 1, 0, 1), 'all', null)).toBe(false)
    expect(pushed).toHaveLength(0)
  })
})

describe('FormatController — merge', () => {
  it('mergeCells 成功：选整块 + 入栈 merge 命令', () => {
    const { fc, pushed, selected } = makeController()
    const r = range(0, 1, 0, 1)
    expect(fc.mergeCells(r)).toBe(true)
    expect(selected).toEqual([r])
    expect(pushed).toHaveLength(1)
    expect(pushed[0]!.kind).toBe('merge')
  })

  it('mergeCells 单格被拒 → false，不选区不入栈', () => {
    const { fc, pushed, selected } = makeController()
    expect(fc.mergeCells(range(0, 0, 0, 0))).toBe(false)
    expect(selected).toHaveLength(0)
    expect(pushed).toHaveLength(0)
  })

  it('unmergeCells 未触及任何区域 → false', () => {
    const { fc, pushed } = makeController()
    expect(fc.unmergeCells(range(0, 1, 0, 1))).toBe(false)
    expect(pushed).toHaveLength(0)
  })

  it('mergeCells 后 unmergeCells 移除并入栈 unmerge', () => {
    const { fc, pushed } = makeController()
    fc.mergeCells(range(0, 1, 0, 1))
    expect(fc.unmergeCells(range(0, 0, 0, 0))).toBe(true)
    expect(pushed[pushed.length - 1]!.kind).toBe('unmerge')
  })
})
