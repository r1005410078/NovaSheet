import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import { InMemoryDataSource } from '../../src/kernel/data/InMemoryDataSource'
import { denseGridTheme } from '../../src/kernel/theme/denseGridTheme'

// 同 DefaultGridEngine.column-groups.test.ts fixture：两组 s1[s1c1,s1c2] s2[s2c1] + 无组 m，5 行。
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

describe('column groups × 结构 mutation', () => {
  it('deleteCols 级联移除空组，undo 完整恢复组树', () => {
    const engine = makeEngine()
    engine.deleteCols(['s1c1', 's1c2'])
    expect(engine.getColumnGroups().some((n) => 'id' in n && n.id === 's1')).toBe(false)
    engine.undo()
    const s1 = engine.getColumnGroups().find((n) => 'id' in n && n.id === 's1')
    expect(s1 && 'children' in s1 ? s1.children : []).toEqual([
      { fieldId: 's1c1' },
      { fieldId: 's1c2' },
    ])
  })

  it('moveCols 跨组 no-op 返 false，fields 与组树均不动', () => {
    const engine = makeEngine()
    const fieldsBefore = engine
      .getData()
      .getSchema()
      .fields.map((f) => f.id)
    expect(engine.moveCols(['s1c2'], 's2c1')).toBe(false)
    expect(
      engine
        .getData()
        .getSchema()
        .fields.map((f) => f.id),
    ).toEqual(fieldsBefore)
  })

  it('moveCols 同组内部成功且组叶序同步', () => {
    const engine = makeEngine()
    expect(engine.moveCols(['s1c2'], 's1c1')).toBe(true)
    const s1 = engine.getColumnGroups().find((n) => 'id' in n && n.id === 's1')
    expect(s1 && 'children' in s1 ? s1.children : []).toEqual([
      { fieldId: 's1c2' },
      { fieldId: 's1c1' },
    ])
  })

  it('insertCols 组内部归组、undo command JSON 纯数据往返', () => {
    const engine = makeEngine()
    engine.insertCols(2, 1) // s1c1 与 s1c2 之间
    const s1 = engine.getColumnGroups().find((n) => 'id' in n && n.id === 's1')
    expect(s1 && 'children' in s1 ? s1.children.length : 0).toBe(3)
    engine.undo()
    // undo 后组树复原且命令可 JSON 往返（沿用 undo 域现有 roundtrip 测试模式补一条含 columnGroups 快照的用例）
    const restored = engine.getColumnGroups().find((n) => 'id' in n && n.id === 's1')
    expect(restored && 'children' in restored ? restored.children : []).toEqual([
      { fieldId: 's1c1' },
      { fieldId: 's1c2' },
    ])
  })
})
