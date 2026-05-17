import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine, InMemoryDataSource, denseGridTheme, type Schema } from '../../src'

const SCHEMA: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 200 },
    { id: 'age', name: 'Age', type: 'number', width: 80 },
  ],
}

function makeData(rows = 10) {
  return new InMemoryDataSource({
    schema: SCHEMA,
    rows: Array.from({ length: rows }, (_, i) => ({ name: `n${i}`, age: i })),
  })
}

describe('DefaultGridEngine — 默认引擎', () => {
  it('用默认主题与 schema 列宽初始化', () => {
    const engine = new DefaultGridEngine({ data: makeData(5) })
    expect(engine.getRowsAxis().getCount()).toBe(5)
    expect(engine.getColsAxis().getCount()).toBe(2)
    expect(engine.getTheme()).toBe(denseGridTheme)
  })

  it('setData 重建行列轴', () => {
    const engine = new DefaultGridEngine({ data: makeData(5) })
    engine.setData(makeData(100))
    expect(engine.getRowsAxis().getCount()).toBe(100)
  })

  it('setRowHeight 更新行轴', () => {
    const engine = new DefaultGridEngine({ data: makeData(10) })
    const before = engine.getRowsAxis().getSize(3)
    engine.setRowHeight(3, before * 2)
    expect(engine.getRowsAxis().getSize(3)).toBe(before * 2)
  })

  it('setColumnWidth 按 fieldId 更新列轴', () => {
    const engine = new DefaultGridEngine({ data: makeData(10) })
    engine.setColumnWidth('age', 250)
    expect(engine.getColsAxis().getSize(1)).toBe(250)
  })

  it('未知 fieldId 的 setColumnWidth 为 no-op', () => {
    const engine = new DefaultGridEngine({ data: makeData(10) })
    expect(() => engine.setColumnWidth('nope', 250)).not.toThrow()
  })

  it('getFrame 返回引擎快照', () => {
    const engine = new DefaultGridEngine({ data: makeData(10) })
    engine.setViewportSize(400, 300)
    const frame = engine.getFrame()
    expect(frame.data.getRowCount()).toBe(10)
    expect(frame.theme).toBe(denseGridTheme)
    expect(frame.rowsAxis.getCount()).toBe(10)
    expect(frame.viewport.contentRect.width).toBe(400)
  })

  it('把 selection 放进 RenderFrame，供 renderer overlay 绘制', () => {
    const engine = new DefaultGridEngine({ data: makeData(5) })

    engine.selectCell({ rowIndex: 2, colIndex: 1 })

    expect(engine.getSelection()).toEqual({
      activeCell: { rowIndex: 2, colIndex: 1 },
      anchorCell: { rowIndex: 2, colIndex: 1 },
      extentCell: { rowIndex: 2, colIndex: 1 },
      selectedRange: {
        startRow: 2,
        endRow: 2,
        startCol: 1,
        endCol: 1,
      },
    })
    expect(engine.getFrame().selection).toEqual(engine.getSelection())
  })
})
