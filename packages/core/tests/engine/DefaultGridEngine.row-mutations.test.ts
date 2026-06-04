import { describe, expect, it } from 'bun:test'
import {
  DefaultGridEngine,
  InMemoryDataSource,
  denseGridTheme,
  type Schema,
} from '../../src'

const schema: Schema = {
  fields: [{ id: 'a', name: 'A', type: 'text', width: 100 }],
}

function mkEngine(rowCount: number) {
  return new DefaultGridEngine({
    data: new InMemoryDataSource({
      schema,
      rows: Array.from({ length: rowCount }, (_, i) => ({ a: `r${i}` })),
    }),
    theme: denseGridTheme,
  })
}

describe('Bug 1: hideRows 后 frame.rowsAxis 与 data.getRowCount 一致', () => {
  it('hideRows 后 frame.rowsAxis.getCount() 等于视图行数', () => {
    const engine = mkEngine(10)
    engine.setViewportSize(300, 400)
    engine.hideRows([3, 4, 5])
    const frame = engine.getFrame()
    expect(frame.data.getRowCount()).toBe(7)
    expect(frame.rowsAxis.getCount()).toBe(7)
  })

  it('视图 row 3 对应 underlying row 6，getCell 返回正确内容', () => {
    const ds = new InMemoryDataSource({
      schema,
      rows: Array.from({ length: 10 }, (_, i) => ({ a: `r${i}` })),
    })
    const engine = new DefaultGridEngine({ data: ds, theme: denseGridTheme })
    engine.setViewportSize(300, 400)
    engine.hideRows([3, 4, 5])
    const frame = engine.getFrame()
    // view rows 0,1,2 → underlying 0,1,2; view row 3 → underlying 6
    expect(frame.data.getCell(3, 'a')).toBe('r6')
  })

  it('unhideRows 后 rowsAxis 恢复到全量行数', () => {
    const engine = mkEngine(10)
    engine.setViewportSize(300, 400)
    engine.hideRows([3, 4, 5])
    engine.unhideRows([3, 4, 5])
    const frame = engine.getFrame()
    expect(frame.data.getRowCount()).toBe(10)
    expect(frame.rowsAxis.getCount()).toBe(10)
  })
})

describe('Bug 2: setData 清空 HideRowsLayer', () => {
  it('setData 后 getHiddenRows() 为空', () => {
    const engine = mkEngine(5)
    engine.hideRows([1, 2])
    expect(engine.getHiddenRows().length).toBe(2)
    engine.setData(
      new InMemoryDataSource({ schema, rows: [{ a: 'x' }] }),
    )
    expect(engine.getHiddenRows()).toEqual([])
  })

  it('setData 后 frame.rowsAxis.getCount() 等于新数据行数', () => {
    const engine = mkEngine(10)
    engine.hideRows([0, 1, 2])
    engine.setData(
      new InMemoryDataSource({ schema, rows: [{ a: 'x' }, { a: 'y' }] }),
    )
    const frame = engine.getFrame()
    expect(frame.data.getRowCount()).toBe(2)
    expect(frame.rowsAxis.getCount()).toBe(2)
  })
})

describe('Row structure operation boundaries', () => {
  it('insertRows 越界时按实际 append 位置记录 undo', () => {
    const engine = mkEngine(2)

    expect(engine.insertRows(999, 1)).toEqual([2])
    expect(engine.getData().getRowCount()).toBe(3)
    expect(engine.getRowsAxis().getCount()).toBe(3)

    engine.undo()

    expect(engine.getData().getRowCount()).toBe(2)
    expect(engine.getRowsAxis().getCount()).toBe(2)
  })

  it('deleteRows 拒绝越界 row id，避免 data 和 rowsAxis 数量错位', () => {
    const engine = mkEngine(3)

    engine.deleteRows([-1])
    engine.deleteRows([3])
    engine.deleteRows([1, 1])

    expect(engine.getData().getRowCount()).toBe(3)
    expect(engine.getRowsAxis().getCount()).toBe(3)
    expect(engine.canUndo()).toBe(false)
  })
})
