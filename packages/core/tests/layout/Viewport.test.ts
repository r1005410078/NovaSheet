import { describe, expect, it } from 'bun:test'
import { ChunkedAxis } from '../../src/layout/ChunkedAxis'
import { FrozenRegions } from '../../src/layout/FrozenRegions'
import { Viewport } from '../../src/layout/Viewport'

describe('Viewport — M1 单象限', () => {
  function setup() {
    const rowsAxis = new ChunkedAxis({ count: 100, defaultSize: 28 })
    const colsAxis = new ChunkedAxis({ count: 5, defaultSize: 100 })
    const frozen = new FrozenRegions(rowsAxis, colsAxis, 0, 0)
    const vp = new Viewport(rowsAxis, colsAxis, frozen)
    vp.setSize(400, 280) // viewport 400x280
    vp.setScroll(0, 0)
    vp.setHeaderHeight(32)
    return { rowsAxis, colsAxis, frozen, vp }
  }

  it('snapshot 的 main 象限覆盖可见行列', () => {
    const { vp } = setup()
    const snap = vp.snapshot()
    expect(snap.quadrants.main).toBeDefined()
    expect(snap.quadrants.topLeft).toBeUndefined()
    // visible rows: y range [0, 280-32=248] → row range [0, ceil(248/28)-1]
    expect(snap.quadrants.main.rowRange[0]).toBe(0)
    expect(snap.quadrants.main.rowRange[1]).toBeGreaterThanOrEqual(8)
    expect(snap.quadrants.main.colRange).toEqual([0, 3]) // 0..99, 100..199, 200..299, 300..399
  })

  it('snapshot 反映当前滚动位置', () => {
    const { vp } = setup()
    vp.setScroll(0, 140) // scroll down 5 rows (140/28)
    const snap = vp.snapshot()
    expect(snap.quadrants.main.rowRange[0]).toBe(5)
  })

  it('变更后 version 递增', () => {
    const { vp } = setup()
    const v0 = vp.snapshot().version
    vp.setScroll(0, 100)
    expect(vp.snapshot().version).toBeGreaterThan(v0)
  })

  it('count=0 时返回空范围', () => {
    const rowsAxis = new ChunkedAxis({ count: 0, defaultSize: 28 })
    const colsAxis = new ChunkedAxis({ count: 0, defaultSize: 100 })
    const frozen = new FrozenRegions(rowsAxis, colsAxis, 0, 0)
    const vp = new Viewport(rowsAxis, colsAxis, frozen)
    vp.setSize(400, 280)
    vp.setHeaderHeight(32)
    const snap = vp.snapshot()
    expect(snap.quadrants.main.rowRange).toEqual([0, -1])
    expect(snap.quadrants.main.colRange).toEqual([0, -1])
  })
})
