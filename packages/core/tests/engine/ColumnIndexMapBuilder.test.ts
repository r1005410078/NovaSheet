import { describe, expect, it } from 'bun:test'
import { ColumnIndexMapBuilder, type Field } from '../../src'

const fieldsAfter: Field[] = [
  { id: 'b', name: 'B', type: 'text', width: 100 },
  { id: 'c', name: 'C', type: 'text', width: 120 },
  { id: 'a', name: 'A', type: 'text', width: 80 },
]

function entries(map: ReadonlyMap<number, number>): readonly [number, number][] {
  return [...map.entries()].sort((a, b) => a[0] - b[0])
}

describe('ColumnIndexMapBuilder', () => {
  it('maps old raw column indices to their new raw column indices by field id', () => {
    const map = new ColumnIndexMapBuilder().build(['a', 'b', 'c'], fieldsAfter)

    expect(entries(map)).toEqual([
      [0, 2],
      [1, 0],
      [2, 1],
    ])
  })

  it('skips fields that no longer exist after the move', () => {
    const map = new ColumnIndexMapBuilder().build(['a', 'missing'], fieldsAfter)

    expect(entries(map)).toEqual([[0, 2]])
  })
})
