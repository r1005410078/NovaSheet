import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../src/kernel/data/InMemoryDataSource'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import { denseGridTheme } from '../../src/kernel/theme/denseGridTheme'

function mkEngine(leftCols: number, rightCols: number, totalCols = 6) {
  const fields = Array.from({ length: totalCols }, (_, i) => ({
    id: `f${i}`,
    name: `F${i}`,
    type: 'text' as const,
    width: 100,
  }))
  const ds = new InMemoryDataSource({
    schema: { fields },
    rows: [Object.fromEntries(fields.map((f) => [f.id, 'v']))],
  })
  return new DefaultGridEngine({
    data: ds,
    theme: denseGridTheme,
    frozen: { topRows: 0, leftCols, rightCols },
  })
}

describe('FrozenRegions 自动同步规则（§4.6）', () => {
  it('insert at < leftCols → leftCols += count', () => {
    const engine = mkEngine(2, 0)
    engine.insertCols(0, 1)
    expect(engine.getFrozenConfig().leftCols).toBe(3)
  })

  it('insert at == leftCols（边界）→ leftCols 不变', () => {
    const engine = mkEngine(2, 0)
    engine.insertCols(2, 1)
    expect(engine.getFrozenConfig().leftCols).toBe(2)
  })

  it('delete 冻结列 → leftCols 减少', () => {
    const engine = mkEngine(2, 0)
    engine.deleteCols(['f0'])
    expect(engine.getFrozenConfig().leftCols).toBe(1)
  })

  it('rightCols：insert at > totalCols - rightCols → rightCols += count', () => {
    const engine = mkEngine(0, 2, 6)
    engine.insertCols(5, 1)
    expect(engine.getFrozenConfig().rightCols).toBe(3)
  })

  it('hide / unhide 不动 frozen counts', () => {
    const engine = mkEngine(2, 0)
    engine.hideCols(['f0'])
    expect(engine.getFrozenConfig().leftCols).toBe(2)
    engine.unhideCols(['f0'])
    expect(engine.getFrozenConfig().leftCols).toBe(2)
  })
})
