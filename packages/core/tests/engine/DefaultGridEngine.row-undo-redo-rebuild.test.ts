import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine, InMemoryDataSource } from '../../src'

// 回归守卫（M3）：行结构 redo 必须像 undo / 列侧一样做**全重建**（axis + frozen + viewport）。
// 旧 switch 的行 redo 只换 `this.rowsAxis` 引用、不重建 viewport/frozen，而 `getViewRowsAxis()`
// 每次 new 一个 axis —— 于是 redo 后 `getFrame().viewport` 仍按陈旧 axis 计算可见行范围。
// 本测试经公开 API（commitRowResize → undo → redo）观察 `viewport.regions` 的可见行范围。

function makeEngine() {
  return new DefaultGridEngine({
    data: new InMemoryDataSource({
      schema: { fields: [{ id: 'a', name: 'A', type: 'text', width: 100 }] },
      rows: Array.from({ length: 20 }, (_, i) => ({ a: `A${i}` })),
    }),
  })
}

function mainRowRange(engine: DefaultGridEngine): readonly [number, number] {
  const region = engine.getFrame().viewport.regions.find((r) => r.id === 'main')
  if (!region) throw new Error('main region missing')
  return region.rowRange
}

describe('DefaultGridEngine 行结构 redo 全重建（viewport 不陈旧）', () => {
  it('resizeRow 的 redo 后 viewport 可见行范围反映新行高', () => {
    const engine = makeEngine()
    engine.setViewportSize(300, 200)

    const baseHeight = engine.getFrame().rowsAxis.getSize(0)
    const shortRange = mainRowRange(engine)

    // 把第 0 行拉到 5000px：小视口内几乎只剩第 0 行，可见行范围收缩。
    engine.commitRowResize(0, baseHeight, 5000)
    const tallRange = mainRowRange(engine)
    expect(tallRange).not.toEqual(shortRange) // 前向已生效（sanity）

    engine.undo()
    expect(mainRowRange(engine)).toEqual(shortRange) // undo 全重建，回到矮行布局

    engine.redo()
    // 关键断言：redo 后 viewport 必须反映 5000px 的高行布局，而非陈旧的矮行布局。
    // 4 个行 kind 共用同一 `rebuildRows()` 全重建路径（隔离单元测试覆盖全部）；此处用 resizeRow
    // 守住 engine 级 viewport 不陈旧——`rowRange` 是 view 索引范围，仅行高变化可观测，隐藏不改窗口。
    expect(mainRowRange(engine)).toEqual(tallRange)
  })
})
