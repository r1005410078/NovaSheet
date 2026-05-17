import { describe, expect, it } from 'bun:test'
import {
  applySelectionNavigation,
  parseSelectionNavigationKey,
  type GridIndexBounds,
} from '../../src/interaction/SelectionNavigation'
import { SelectionModel } from '../../src/interaction/SelectionModel'

const bounds: GridIndexBounds = { rowCount: 10, colCount: 5 }

describe('parseSelectionNavigationKey — Phase 3.3', () => {
  it('方向键与 Tab / Enter', () => {
    expect(parseSelectionNavigationKey('ArrowDown', false)).toEqual({
      kind: 'delta',
      dRow: 1,
      dCol: 0,
      extend: false,
    })
    expect(parseSelectionNavigationKey('ArrowUp', true)).toEqual({
      kind: 'delta',
      dRow: -1,
      dCol: 0,
      extend: true,
    })
    expect(parseSelectionNavigationKey('Tab', false)?.kind).toBe('tab')
    expect(parseSelectionNavigationKey('Tab', true)).toEqual({
      kind: 'tab',
      backward: true,
      extend: true,
    })
    expect(parseSelectionNavigationKey('Enter', false)).toEqual({
      kind: 'delta',
      dRow: 1,
      dCol: 0,
      extend: false,
    })
    expect(parseSelectionNavigationKey('Enter', true)).toEqual({
      kind: 'delta',
      dRow: -1,
      dCol: 0,
      extend: true,
    })
  })

  it('忽略未映射按键', () => {
    expect(parseSelectionNavigationKey('a', false)).toBeNull()
    expect(parseSelectionNavigationKey('Escape', false)).toBeNull()
  })
})

describe('SelectionModel.navigate — Phase 3.3', () => {
  it('无选区时从 (0,0) 起步', () => {
    const model = new SelectionModel()
    model.navigate({ kind: 'delta', dRow: 0, dCol: 1, extend: false }, bounds)
    expect(model.getSelection().activeCell).toEqual({ rowIndex: 0, colIndex: 1 })
  })

  it('方向键移动会折叠为单格选区', () => {
    const model = new SelectionModel()
    model.selectCell({ rowIndex: 1, colIndex: 1 })
    model.selectCell({ rowIndex: 3, colIndex: 3 }, { extend: true })

    model.navigate({ kind: 'delta', dRow: 0, dCol: 1, extend: false }, bounds)

    expect(model.getSelection()).toEqual({
      activeCell: { rowIndex: 1, colIndex: 2 },
      anchorCell: { rowIndex: 1, colIndex: 2 },
      extentCell: { rowIndex: 1, colIndex: 2 },
      selectedRange: { startRow: 1, endRow: 1, startCol: 2, endCol: 2 },
    })
  })

  it('Shift + 方向键从 extent 扩展', () => {
    const model = new SelectionModel()
    model.selectCell({ rowIndex: 2, colIndex: 2 })
    model.navigate({ kind: 'delta', dRow: 0, dCol: 1, extend: true }, bounds)

    expect(model.getSelection()).toEqual({
      activeCell: { rowIndex: 2, colIndex: 2 },
      anchorCell: { rowIndex: 2, colIndex: 2 },
      extentCell: { rowIndex: 2, colIndex: 3 },
      selectedRange: { startRow: 2, endRow: 2, startCol: 2, endCol: 3 },
    })
  })

  it('Tab 在末列换行', () => {
    const model = new SelectionModel()
    model.selectCell({ rowIndex: 0, colIndex: 4 })
    model.navigate({ kind: 'tab', backward: false, extend: false }, bounds)
    expect(model.getSelection().activeCell).toEqual({ rowIndex: 1, colIndex: 0 })
  })

  it('边界处不再越界', () => {
    const model = new SelectionModel()
    model.selectCell({ rowIndex: 9, colIndex: 4 })
    model.navigate({ kind: 'delta', dRow: 1, dCol: 0, extend: false }, bounds)
    expect(model.getSelection().activeCell).toEqual({ rowIndex: 9, colIndex: 4 })
  })
})

describe('applySelectionNavigation', () => {
  it('返回下一格地址供滚动跟随', () => {
    const model = new SelectionModel()
    model.selectCell({ rowIndex: 1, colIndex: 1 })
    const next = applySelectionNavigation(model, { kind: 'delta', dRow: 1, dCol: 0, extend: false }, bounds)
    expect(next).toEqual({ rowIndex: 2, colIndex: 1 })
  })
})
