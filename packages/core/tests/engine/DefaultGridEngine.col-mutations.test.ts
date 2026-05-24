import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import { denseGridTheme } from '../../src/theme/denseGridTheme'

const schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text' as const, width: 100 },
    { id: 'b', name: 'B', type: 'number' as const, width: 80 },
    { id: 'c', name: 'C', type: 'text' as const, width: 120 },
  ],
}

function mkEngine() {
  const ds = new InMemoryDataSource({
    schema: { fields: schema.fields.map((field) => ({ ...field })) },
    rows: Array.from({ length: 5 }, (_, i) => ({ a: `r${i}`, b: i, c: `x${i}` })),
  })
  return { engine: new DefaultGridEngine({ data: ds, theme: denseGridTheme }), ds }
}

describe('DefaultGridEngine.insertCols', () => {
  it('插 1 列在 index 1；axis 与 schema 同步增长', () => {
    const { engine } = mkEngine()
    const newFields = engine.insertCols(1, 1)

    expect(newFields).toHaveLength(1)
    expect(engine.getDataSource().getSchema().fields).toHaveLength(4)
    expect(engine.getFrame().colsAxis.getCount()).toBe(4)
  })

  it('insertCols 后 selection 整体右移', () => {
    const { engine } = mkEngine()
    engine.setSelection({
      activeCell: { rowIndex: 0, colIndex: 2 },
      anchorCell: { rowIndex: 0, colIndex: 2 },
      extentCell: { rowIndex: 0, colIndex: 2 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 2, endCol: 2 },
    })

    engine.insertCols(1, 2)

    expect(engine.getSelection().activeCell?.colIndex).toBe(4)
  })
})

describe('DefaultGridEngine.deleteCols', () => {
  it('删 b 列；剩余 a, c 顺序 + cell 值不变', () => {
    const { engine, ds } = mkEngine()

    const snapshots = engine.deleteCols(['b'])

    expect(snapshots).toHaveLength(1)
    expect(ds.getSchema().fields.map((f) => f.id)).toEqual(['a', 'c'])
    expect(ds.getCell(2, 'a')).toBe('r2')
    expect(ds.getCell(2, 'c')).toBe('x2')
    expect(engine.getFrame().colsAxis.getCount()).toBe(2)
  })
})

describe('DefaultGridEngine.hideCols', () => {
  it('hideCols 后 frame.colsAxis.getCount 等于 schema - hidden', () => {
    const { engine } = mkEngine()

    engine.hideCols(['b'])

    expect(engine.getFrame().colsAxis.getCount()).toBe(2)
    expect(engine.getFrame().data.getSchema().fields.map((field) => field.id)).toEqual(['a', 'c'])
    expect(engine.getHiddenCols()).toEqual(['b'])
  })

  it('setData 清空 hiddenCols', () => {
    const { engine } = mkEngine()
    engine.hideCols(['b', 'c'])
    expect(engine.getHiddenCols()).toHaveLength(2)

    engine.setData(new InMemoryDataSource({ schema, rows: [{ a: 'x', b: 0, c: 'y' }] }))

    expect(engine.getHiddenCols()).toEqual([])
  })
})

describe('DefaultGridEngine.setColumnWidths', () => {
  it('隐藏列后 commitColumnResize 使用可见列索引映射到 raw field', () => {
    const { engine, ds } = mkEngine()

    engine.hideCols(['b'])
    engine.commitColumnResize(1, 120, 240)

    const fields = engine.getDataSource().getSchema().fields
    expect(fields.find((f) => f.id === 'b')).toBeUndefined()
    expect(ds.getSchema().fields.find((f) => f.id === 'b')!.width).toBe(80)
    expect(ds.getSchema().fields.find((f) => f.id === 'c')!.width).toBe(240)
    expect(engine.getFrame().colsAxis.getSize(1)).toBe(240)
  })

  it('多列宽度批量改 + undo 还原', () => {
    const { engine } = mkEngine()

    engine.setColumnWidths(['a', 'c'], 200)
    let fields = engine.getDataSource().getSchema().fields
    expect(fields.find((f) => f.id === 'a')!.width).toBe(200)
    expect(fields.find((f) => f.id === 'c')!.width).toBe(200)

    engine.undo()

    fields = engine.getDataSource().getSchema().fields
    expect(fields.find((f) => f.id === 'a')!.width).toBe(100)
    expect(fields.find((f) => f.id === 'c')!.width).toBe(120)
  })
})
