import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine, InMemoryDataSource } from '../../src'

function makeEngine() {
  return new DefaultGridEngine({
    data: new InMemoryDataSource({
      schema: {
        fields: [
          { id: 'a', name: 'A', type: 'text', width: 100 },
          { id: 'b', name: 'B', type: 'text', width: 100 },
          { id: 'c', name: 'C', type: 'text', width: 100 },
        ],
      },
      rows: [{ a: 'A1', b: 'B1', c: 'C1' }, { a: 'A2', b: 'B2', c: 'C2' }, { a: 'A3', b: 'B3', c: 'C3' }],
    }),
  })
}

describe('DefaultGridEngine format/merge structural remap', () => {
  it('keeps format and merge coordinates aligned after row/col insertions', () => {
    const engine = makeEngine()
    engine.setFillColor({ startRow: 1, endRow: 1, startCol: 1, endCol: 1 }, '#fff2cc')
    engine.mergeCells({ startRow: 1, endRow: 2, startCol: 1, endCol: 2 })

    engine.insertRows(1, 1)
    engine.insertCols(1, 1)

    expect(engine.getCellFormat(2, 2)?.fillColor).toBe('#fff2cc')
    expect(engine.getMergeRegion(2, 2)?.range).toEqual({ startRow: 2, endRow: 3, startCol: 2, endCol: 3 })
  })

  it('keeps format and merge coordinates aligned after row and column moves', () => {
    const engine = makeEngine()
    engine.setFillColor({ startRow: 0, endRow: 0, startCol: 1, endCol: 1 }, '#fff2cc')
    engine.mergeCells({ startRow: 0, endRow: 1, startCol: 1, endCol: 2 })

    // 行：把 row 0,1 移到末尾 → 顺序 [2,0,1]，fill row0→1、merge rows0-1→1-2。
    expect(engine.moveRows([0, 1], null)).toBe(true)
    // 列：把 col 'a' 移到末尾 → 顺序 [b,c,a]，col index map {0→2,1→0,2→1}，fill col1→0、merge cols1-2→0-1。
    // 注意：moveCols(['b','c'], null) 是 no-op（b,c 已在末尾），会返回 false，不能用作 reorder 用例。
    expect(engine.moveCols(['a'], null)).toBe(true)

    expect(engine.getCellFormat(1, 0)?.fillColor).toBe('#fff2cc')
    expect(engine.getMergeRegion(1, 0)?.range).toEqual({ startRow: 1, endRow: 2, startCol: 0, endCol: 1 })
  })
})
