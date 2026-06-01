import { describe, expect, it } from 'bun:test'
import { ColumnMoveNormalizer, type Field } from '../../src'

const fields: Field[] = [
  { id: 'a', name: 'A', type: 'text', width: 80 },
  { id: 'b', name: 'B', type: 'text', width: 100 },
  { id: 'c', name: 'C', type: 'text', width: 120 },
  { id: 'd', name: 'D', type: 'text', width: 140 },
]

describe('ColumnMoveNormalizer', () => {
  const normalizer = new ColumnMoveNormalizer()

  it('normalizes requested fields into schema order and computes the undo target', () => {
    expect(normalizer.normalize(fields, ['c', 'b'], 'a')).toEqual({
      fieldIds: ['b', 'c'],
      beforeFieldId: 'a',
      inverseBeforeFieldId: 'd',
    })
  })

  it('computes an undo target when moving a leading group to the end', () => {
    expect(normalizer.normalize(fields, ['a'], null)).toEqual({
      fieldIds: ['a'],
      beforeFieldId: null,
      inverseBeforeFieldId: 'b',
    })
  })

  it('rejects non-contiguous field groups', () => {
    expect(normalizer.normalize(fields, ['a', 'c'], null)).toBeNull()
  })

  it('rejects drops into the moving group or equivalent self drops', () => {
    expect(normalizer.normalize(fields, ['b', 'c'], 'b')).toBeNull()
    expect(normalizer.normalize(fields, ['b', 'c'], 'd')).toBeNull()
  })

  it('rejects unknown move targets', () => {
    expect(normalizer.normalize(fields, ['b'], 'missing')).toBeNull()
  })
})
