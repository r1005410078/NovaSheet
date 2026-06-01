import { describe, expect, it } from 'bun:test'
import { CollapsedColGapBuilder, type Field } from '../../src'

const fields: Field[] = [
  { id: 'a', name: 'A', type: 'text', width: 80 },
  { id: 'b', name: 'B', type: 'text', width: 80 },
  { id: 'c', name: 'C', type: 'text', width: 80 },
  { id: 'd', name: 'D', type: 'text', width: 80 },
  { id: 'e', name: 'E', type: 'text', width: 80 },
]

describe('CollapsedColGapBuilder', () => {
  it('returns no gaps when no field is hidden', () => {
    expect(new CollapsedColGapBuilder().build(fields, new Set())).toEqual([])
  })

  it('groups adjacent hidden columns and anchors gaps after the previous visible column', () => {
    const gaps = new CollapsedColGapBuilder().build(fields, new Set(['b', 'c', 'e']))

    expect(gaps).toEqual([
      { atViewCol: 0, hiddenCount: 2, hiddenFieldIds: ['b', 'c'] },
      { atViewCol: 1, hiddenCount: 1, hiddenFieldIds: ['e'] },
    ])
  })

  it('anchors a leading hidden run before the first visible column', () => {
    const gaps = new CollapsedColGapBuilder().build(fields, new Set(['a', 'b']))

    expect(gaps).toEqual([{ atViewCol: -1, hiddenCount: 2, hiddenFieldIds: ['a', 'b'] }])
  })
})
