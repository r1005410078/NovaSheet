import { describe, expect, it } from 'bun:test'
import { FrozenColumnSyncer } from '../../src'

describe('FrozenColumnSyncer', () => {
  const syncer = new FrozenColumnSyncer()

  it('expands left frozen columns when inserting before the left boundary', () => {
    expect(
      syncer.afterInsert({ topRows: 1, leftCols: 2, rightCols: 0 }, { at: 0, count: 2, oldTotalCols: 6 }),
    ).toEqual({ topRows: 1, leftCols: 4, rightCols: 0 })
  })

  it('keeps left frozen columns unchanged when inserting at the left boundary', () => {
    expect(
      syncer.afterInsert({ topRows: 0, leftCols: 2, rightCols: 0 }, { at: 2, count: 1, oldTotalCols: 6 }),
    ).toEqual({ topRows: 0, leftCols: 2, rightCols: 0 })
  })

  it('expands right frozen columns when inserting inside the right frozen band', () => {
    expect(
      syncer.afterInsert({ topRows: 0, leftCols: 0, rightCols: 2 }, { at: 5, count: 1, oldTotalCols: 6 }),
    ).toEqual({ topRows: 0, leftCols: 0, rightCols: 3 })
  })

  it('shrinks frozen counts by deleted columns inside each frozen band', () => {
    expect(
      syncer.afterDelete(
        { topRows: 1, leftCols: 2, rightCols: 2 },
        { removedIndices: [0, 4, 5], totalColsBefore: 6 },
      ),
    ).toEqual({ topRows: 1, leftCols: 1, rightCols: 0 })
  })
})
