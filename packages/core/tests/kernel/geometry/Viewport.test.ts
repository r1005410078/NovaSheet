import { describe, expect, it } from 'bun:test'
import { ChunkedAxis } from '../../../src/kernel/geometry/ChunkedAxis'
import { FrozenRegions } from '../../../src/kernel/geometry/FrozenRegions'
import { Viewport } from '../../../src/kernel/geometry/Viewport'

describe('Viewport — regions 快照', () => {
  function setup() {
    const rowsAxis = new ChunkedAxis({ count: 100, defaultSize: 28 })
    const colsAxis = new ChunkedAxis({ count: 5, defaultSize: 100 })
    const frozen = new FrozenRegions(rowsAxis, colsAxis, {})
    const vp = new Viewport(rowsAxis, colsAxis, frozen)
    vp.setSize(400, 280) // viewport 400x280
    vp.setScroll(0, 0)
    vp.setHeaderHeight(32)
    return { rowsAxis, colsAxis, frozen, vp }
  }

  it('snapshot 的 main 区域覆盖可见行列', () => {
    const { vp } = setup()
    const snap = vp.snapshot()
    const main = snap.regions.find((region) => region.id === 'main')
    expect(main).toBeDefined()
    expect(snap.regions.find((region) => region.id === 'topLeft')).toBeUndefined()
    // visible rows: y range [0, 280-32=248] → row range [0, ceil(248/28)-1]
    expect(main!.rowRange[0]).toBe(0)
    expect(main!.rowRange[1]).toBeGreaterThanOrEqual(8)
    expect(main!.colRange).toEqual([0, 3]) // 0..99, 100..199, 200..299, 300..399
  })

  it('snapshot 反映当前滚动位置', () => {
    const { vp } = setup()
    vp.setScroll(0, 140) // scroll down 5 rows (140/28)
    const snap = vp.snapshot()
    expect(snap.regions.find((region) => region.id === 'main')!.rowRange[0]).toBe(5)
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
    const frozen = new FrozenRegions(rowsAxis, colsAxis, {})
    const vp = new Viewport(rowsAxis, colsAxis, frozen)
    vp.setSize(400, 280)
    vp.setHeaderHeight(32)
    const snap = vp.snapshot()
    const main = snap.regions.find((region) => region.id === 'main')!
    expect(main.rowRange).toEqual([0, -1])
    expect(main.colRange).toEqual([0, -1])
  })
})
