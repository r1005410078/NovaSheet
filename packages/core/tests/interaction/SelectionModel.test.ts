import { describe, expect, it } from 'bun:test'
import { SelectionModel } from '../../src/interaction/SelectionModel'

describe('SelectionModel — Phase 3.1 选择基础状态', () => {
  it('点击单元格时同时设置 activeCell、anchorCell 与 selectedRange', () => {
    const model = new SelectionModel()

    model.selectCell({ rowIndex: 2, colIndex: 3 })

    expect(model.getSelection()).toEqual({
      activeCell: { rowIndex: 2, colIndex: 3 },
      anchorCell: { rowIndex: 2, colIndex: 3 },
      extentCell: { rowIndex: 2, colIndex: 3 },
      selectedRange: {
        startRow: 2,
        endRow: 2,
        startCol: 3,
        endCol: 3,
      },
    })
  })

  it('扩展选择时保留 activeCell/anchorCell，只移动 extentCell 并归一化 range', () => {
    const model = new SelectionModel()
    model.selectCell({ rowIndex: 5, colIndex: 4 })

    model.selectCell({ rowIndex: 2, colIndex: 1 }, { extend: true })

    expect(model.getSelection()).toEqual({
      activeCell: { rowIndex: 5, colIndex: 4 },
      anchorCell: { rowIndex: 5, colIndex: 4 },
      extentCell: { rowIndex: 2, colIndex: 1 },
      selectedRange: {
        startRow: 2,
        endRow: 5,
        startCol: 1,
        endCol: 4,
      },
    })
  })
})
