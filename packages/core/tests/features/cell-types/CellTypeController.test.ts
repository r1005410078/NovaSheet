import { describe, expect, it } from 'bun:test'
import { CellTypeController, CellTypeStore } from '../../../src/features/cell-types'
import type { CellTypeControllerContext } from '../../../src/features/cell-types/CellTypeController'
import type { CellRange, GridSelection } from '../../../src/kernel/coords/SelectionTypes'
import { asRawRange } from '../../../src/kernel/coords/coordinates'
import type { UndoCommand } from '../../../src/kernel/undo/UndoCommand'

const EMPTY_SELECTION: GridSelection = {
  activeCell: null,
  anchorCell: null,
  extentCell: null,
  selectedRange: null,
}

const SINGLE_CELL_RANGE: CellRange = {
  startRow: 0,
  endRow: 0,
  startCol: 0,
  endCol: 0,
}

function makeContext(overrides: Partial<CellTypeControllerContext> = {}): {
  readonly ctx: CellTypeControllerContext
  readonly pushed: UndoCommand[]
} {
  const pushed: UndoCommand[] = []
  const ctx: CellTypeControllerContext = {
    translateRange: (range) => asRawRange({ ...range }),
    pushUndo: (command) => pushed.push(command),
    getSelection: () => EMPTY_SELECTION,
    ...overrides,
  }
  return { ctx, pushed }
}

describe('CellTypeController', () => {
  it('translates view range, writes store, and pushes undo', () => {
    const store = new CellTypeStore()
    const { ctx, pushed } = makeContext({
      translateRange: (range) =>
        asRawRange({
          startRow: range.startRow + 1,
          endRow: range.endRow + 1,
          startCol: range.startCol,
          endCol: range.endCol,
        }),
    })
    const controller = new CellTypeController(store, ctx)

    expect(controller.setCellType(SINGLE_CELL_RANGE, 'date')).toBe(true)
    expect(store.get(1, 0)).toBe('date')
    expect(pushed).toHaveLength(1)
    expect(pushed[0]?.kind).toBe('cellType')

    expect(controller.clearCellType(SINGLE_CELL_RANGE)).toBe(true)
    expect(store.get(1, 0)).toBeUndefined()
    expect(pushed).toHaveLength(2)
    expect(pushed[1]?.kind).toBe('cellType')
  })

  it('returns false for non-contiguous translated ranges', () => {
    const store = new CellTypeStore()
    const { ctx, pushed } = makeContext({ translateRange: () => null })
    const controller = new CellTypeController(store, ctx)

    expect(controller.setCellType(SINGLE_CELL_RANGE, 'date')).toBe(false)
    expect(store.snapshot()).toEqual([])
    expect(pushed).toHaveLength(0)
  })

  it('returns false and skips undo when snapshot is unchanged', () => {
    const store = new CellTypeStore()
    const { ctx, pushed } = makeContext()
    const controller = new CellTypeController(store, ctx)

    expect(controller.clearCellType(SINGLE_CELL_RANGE)).toBe(false)
    expect(controller.setCellType(SINGLE_CELL_RANGE, 'number')).toBe(true)
    pushed.length = 0

    expect(controller.setCellType(SINGLE_CELL_RANGE, 'number')).toBe(false)
    expect(store.get(0, 0)).toBe('number')
    expect(pushed).toHaveLength(0)
  })
})
