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
      rows: [
        { a: 'A1', b: 'B1', c: 'C1' },
        { a: 'A2', b: 'B2', c: 'C2' },
        { a: 'A3', b: 'B3', c: 'C3' },
      ],
    }),
  })
}

describe('DefaultGridEngine structural undo/redo store alignment', () => {
  it('realigns format store after insertRows undo/redo', () => {
    const engine = makeEngine()
    engine.setFillColor({ startRow: 1, endRow: 1, startCol: 1, endCol: 1 }, '#fff2cc')

    engine.insertRows(1, 1)
    expect(engine.getCellFormat(2, 1)?.fillColor).toBe('#fff2cc')

    engine.undo()
    // 撤销后填充应回到原始 raw 坐标 (1,1)，且移位后的 (2,1) 不再命中。
    expect(engine.getCellFormat(1, 1)?.fillColor).toBe('#fff2cc')
    expect(engine.getCellFormat(2, 1)).toBeUndefined()

    engine.redo()
    expect(engine.getCellFormat(2, 1)?.fillColor).toBe('#fff2cc')
    expect(engine.getCellFormat(1, 1)).toBeUndefined()
  })

  it('restores fill dropped by deleteRows on undo (delete-loses-data)', () => {
    const engine = makeEngine()
    engine.setFillColor({ startRow: 1, endRow: 1, startCol: 1, endCol: 1 }, '#fff2cc')

    engine.deleteRows([1])
    // 删除后 row 1 被剔除，原填充随之消失。
    expect(engine.getCellFormat(1, 1)).toBeUndefined()

    engine.undo()
    // 关键用例：删除会丢弃格式，仅靠快照才能在 undo 时恢复。
    expect(engine.getCellFormat(1, 1)?.fillColor).toBe('#fff2cc')

    engine.redo()
    expect(engine.getCellFormat(1, 1)).toBeUndefined()
  })

  it('restores merge dropped by deleteCols on undo (column delete-loses-data)', () => {
    const engine = makeEngine()
    engine.mergeCells({ startRow: 0, endRow: 1, startCol: 1, endCol: 2 })
    expect(engine.getMergeRegion(0, 1)?.range).toEqual({
      startRow: 0,
      endRow: 1,
      startCol: 1,
      endCol: 2,
    })

    engine.deleteCols(['b'])
    // 删除合并触及的列 → 5-A 直接整片移除合并区。
    expect(engine.getMergeRegion(0, 1)).toBeNull()

    engine.undo()
    expect(engine.getMergeRegion(0, 1)?.range).toEqual({
      startRow: 0,
      endRow: 1,
      startCol: 1,
      endCol: 2,
    })

    engine.redo()
    expect(engine.getMergeRegion(0, 1)).toBeNull()
  })

  it('realigns merge store after moveRows undo/redo', () => {
    const engine = makeEngine()
    engine.mergeCells({ startRow: 0, endRow: 1, startCol: 1, endCol: 2 })

    // 把 row 0,1 移到末尾 → 顺序 [2,0,1]，merge rows0-1 → rows1-2。
    expect(engine.moveRows([0, 1], null)).toBe(true)
    expect(engine.getMergeRegion(1, 1)?.range).toEqual({
      startRow: 1,
      endRow: 2,
      startCol: 1,
      endCol: 2,
    })

    engine.undo()
    expect(engine.getMergeRegion(0, 1)?.range).toEqual({
      startRow: 0,
      endRow: 1,
      startCol: 1,
      endCol: 2,
    })

    engine.redo()
    expect(engine.getMergeRegion(1, 1)?.range).toEqual({
      startRow: 1,
      endRow: 2,
      startCol: 1,
      endCol: 2,
    })
  })

  it('realigns format store after insertCols undo/redo', () => {
    const engine = makeEngine()
    engine.setFillColor({ startRow: 0, endRow: 0, startCol: 1, endCol: 1 }, '#fff2cc')

    engine.insertCols(1, 1)
    expect(engine.getCellFormat(0, 2)?.fillColor).toBe('#fff2cc')

    engine.undo()
    expect(engine.getCellFormat(0, 1)?.fillColor).toBe('#fff2cc')
    expect(engine.getCellFormat(0, 2)).toBeUndefined()

    engine.redo()
    expect(engine.getCellFormat(0, 2)?.fillColor).toBe('#fff2cc')
    expect(engine.getCellFormat(0, 1)).toBeUndefined()
  })

  it('realigns format store after moveCols undo/redo', () => {
    const engine = makeEngine()
    engine.setFillColor({ startRow: 0, endRow: 0, startCol: 1, endCol: 1 }, '#fff2cc')

    // 把 col 'a' 移到末尾 → 顺序 [b,c,a]，index map {0→2,1→0,2→1}，fill col1 → col0。
    expect(engine.moveCols(['a'], null)).toBe(true)
    expect(engine.getCellFormat(0, 0)?.fillColor).toBe('#fff2cc')

    engine.undo()
    expect(engine.getCellFormat(0, 1)?.fillColor).toBe('#fff2cc')
    expect(engine.getCellFormat(0, 0)).toBeUndefined()

    engine.redo()
    expect(engine.getCellFormat(0, 0)?.fillColor).toBe('#fff2cc')
    expect(engine.getCellFormat(0, 1)).toBeUndefined()
  })
})
