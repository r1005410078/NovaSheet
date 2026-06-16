import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import { InMemoryDataSource } from '../../src/kernel/data/InMemoryDataSource'

describe('DefaultGridEngine hovered column header menu frame state', () => {
  function makeEngine() {
    return new DefaultGridEngine({
      data: new InMemoryDataSource({
        rows: [{ a: 'A' }],
        schema: { fields: [{ id: 'a', name: 'A', type: 'text', width: 100 }] },
      }),
    })
  }

  it('hoveredColumnHeaderMenu is undefined by default', () => {
    const engine = makeEngine()
    expect(engine.getFrame().hoveredColumnHeaderMenu).toBeUndefined()
  })

  it('setHoveredColumnHeaderMenu propagates to RenderFrame', () => {
    const engine = makeEngine()
    engine.setHoveredColumnHeaderMenu({ colIndex: 0, buttonHovered: false })
    expect(engine.getFrame().hoveredColumnHeaderMenu).toEqual({ colIndex: 0, buttonHovered: false })
  })

  it('setHoveredColumnHeaderMenu(null) clears hoveredColumnHeaderMenu', () => {
    const engine = makeEngine()
    engine.setHoveredColumnHeaderMenu({ colIndex: 0, buttonHovered: false })
    engine.setHoveredColumnHeaderMenu(null)
    expect(engine.getFrame().hoveredColumnHeaderMenu).toBeUndefined()
  })

  it('hoveredColumnHeaderMenu colIndex updates correctly', () => {
    const engine = makeEngine()
    engine.setHoveredColumnHeaderMenu({ colIndex: 0, buttonHovered: false })
    engine.setHoveredColumnHeaderMenu({ colIndex: 3, buttonHovered: true })
    expect(engine.getFrame().hoveredColumnHeaderMenu).toEqual({ colIndex: 3, buttonHovered: true })
  })
})
