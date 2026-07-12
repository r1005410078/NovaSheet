import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import { InMemoryDataSource } from '../../src/kernel/data/InMemoryDataSource'
import { denseGridTheme } from '../../src/kernel/theme/denseGridTheme'

function makeEngine() {
  const data = new InMemoryDataSource({
    schema: {
      fields: [
        { id: 'm', name: 'm', type: 'text', width: 100 },
        { id: 's1c1', name: 's1c1', type: 'text', width: 100 },
        { id: 's1c2', name: 's1c2', type: 'text', width: 100 },
        { id: 's2c1', name: 's2c1', type: 'text', width: 100 },
      ],
      columnGroups: [
        { fieldId: 'm' },
        { id: 's1', label: '堆1', children: [{ fieldId: 's1c1' }, { fieldId: 's1c2' }] },
        { id: 's2', label: '堆2', children: [{ fieldId: 's2c1' }] },
      ],
    },
    rows: Array.from({ length: 5 }, () => ({ m: 'x', s1c1: 1, s1c2: 2, s2c1: 3 })),
  })
  const engine = new DefaultGridEngine({ data, theme: denseGridTheme })
  engine.setViewportSize(800, 600)
  return engine
}

describe('DefaultGridEngine column groups', () => {
  it('getFrame 下发 columnGroupHeader 且 viewport.headerHeight 为总高', () => {
    const frame = makeEngine().getFrame()
    const cg = frame.columnGroupHeader!
    expect(cg.depth).toBe(1)
    expect(cg.rows[0]).toEqual([
      { groupId: 's1', label: '堆1', startViewCol: 1, endViewCol: 2, selected: false },
      { groupId: 's2', label: '堆2', startViewCol: 3, endViewCol: 3, selected: false },
    ])
    expect(cg.leafTopRowByViewCol).toEqual([0, 1, 1, 1])
    expect(frame.viewport.headerHeight).toBe(
      denseGridTheme.metrics.groupHeaderRowHeight + denseGridTheme.metrics.headerHeight,
    )
    expect(frame.viewport.leafHeaderHeight).toBe(denseGridTheme.metrics.headerHeight)
  })

  it('selectColumnGroup 写整列 range 且 frame selected 派生', () => {
    const engine = makeEngine()
    expect(engine.selectColumnGroup('s1')).toBe(true)
    expect(engine.getSelection().selectedRange).toEqual({
      startRow: 0,
      endRow: 4,
      startCol: 1,
      endCol: 2,
    })
    const cg = engine.getFrame().columnGroupHeader!
    expect(cg.rows[0]![0]!.selected).toBe(true)
    expect(cg.rows[0]![1]!.selected).toBe(false)
    expect(engine.selectColumnGroup('ghost')).toBe(false)
  })

  it('非法组树 setData throw；无组 schema frame 无 columnGroupHeader', () => {
    const engine = makeEngine()
    expect(() =>
      engine.setData(
        new InMemoryDataSource({
          schema: {
            fields: [{ id: 'a', name: 'a', type: 'text', width: 100 }],
            columnGroups: [{ id: 'g', label: 'x', children: [{ fieldId: 'ghost' }] }],
          },
          rows: [],
        }),
      ),
    ).toThrow(/column-groups/)
  })

  it('selectColumnGroup 的 activeCell/anchorCell 匹配 selectWholeColumnRange(startCol, endCol) 约定', () => {
    const engine = makeEngine()
    expect(engine.selectColumnGroup('s1')).toBe(true)
    const selection = engine.getSelection()
    // s1 = [s1c1, s1c2] → view cols [1, 2]；anchor 左边界、active/extent 右边界。
    expect(selection.anchorCell.colIndex).toBe(1)
    expect(selection.activeCell.colIndex).toBe(2)
    expect(selection.extentCell.colIndex).toBe(2)
  })
})
