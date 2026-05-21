import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'
import type { Schema } from '../../src/data/Schema'

const schema: Schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text', width: 80 },
    { id: 'b', name: 'B', type: 'number', width: 80 },
  ],
}

function makeEngine() {
  const data = new InMemoryDataSource({
    schema,
    rows: [
      { a: 'x', b: 1 },
      { a: 'y', b: 2 },
    ],
  })
  return new DefaultGridEngine({ data })
}

describe('DefaultGridEngine — undo/redo scaffolding', () => {
  it('初始 canUndo / canRedo 均 false', () => {
    const engine = makeEngine()
    expect(engine.canUndo()).toBe(false)
    expect(engine.canRedo()).toBe(false)
  })

  it('undo / redo 在空栈返回 undefined', () => {
    const engine = makeEngine()
    expect(engine.undo()).toBeUndefined()
    expect(engine.redo()).toBeUndefined()
  })

  it('setData 清空栈', () => {
    const engine = makeEngine()
    engine.commitRowResize(0, 24, 50)
    expect(engine.canUndo()).toBe(true)

    const data2 = new InMemoryDataSource({ schema, rows: [{ a: 'p', b: 9 }] })
    engine.setData(data2)
    expect(engine.canUndo()).toBe(false)
    expect(engine.canRedo()).toBe(false)
  })
})
