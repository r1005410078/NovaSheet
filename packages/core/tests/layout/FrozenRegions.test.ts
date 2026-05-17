import { describe, expect, it } from 'bun:test'
import { ChunkedAxis } from '../../src/layout/ChunkedAxis'
import { FrozenRegions } from '../../src/layout/FrozenRegions'

describe('FrozenRegions — M3 冻结区域', () => {
  it('按顶部行、左侧列、右侧列把 viewport 切成 2x3 个区域', () => {
    const rowsAxis = new ChunkedAxis({ count: 20, defaultSize: 28 })
    const colsAxis = new ChunkedAxis({ count: 8, defaultSize: 100 })
    const frozen = new FrozenRegions(rowsAxis, colsAxis, {
      topRows: 2,
      leftCols: 1,
      rightCols: 1,
    })

    const regions = frozen.getRegions({
      width: 400,
      height: 200,
      scrollX: 100,
      scrollY: 84,
      headerHeight: 32,
    })

    expect(regions.map((r) => r.id)).toEqual([
      'main',
      'middleLeft',
      'middleRight',
      'topCenter',
      'topLeft',
      'topRight',
    ])
    expect(regions.find((r) => r.id === 'topLeft')).toEqual({
      id: 'topLeft',
      rowBand: 'top',
      colBand: 'left',
      rowRange: [0, 1],
      colRange: [0, 0],
      rect: { x: 0, y: 32, width: 100, height: 56 },
      scrollOffsetX: 0,
      scrollOffsetY: 0,
      zIndex: 40,
    })
    expect(regions.find((r) => r.id === 'topCenter')).toEqual({
      id: 'topCenter',
      rowBand: 'top',
      colBand: 'center',
      rowRange: [0, 1],
      colRange: [2, 3],
      rect: { x: 100, y: 32, width: 200, height: 56 },
      scrollOffsetX: 200,
      scrollOffsetY: 0,
      zIndex: 30,
    })
    expect(regions.find((r) => r.id === 'topRight')).toEqual({
      id: 'topRight',
      rowBand: 'top',
      colBand: 'right',
      rowRange: [0, 1],
      colRange: [7, 7],
      rect: { x: 300, y: 32, width: 100, height: 56 },
      scrollOffsetX: 700,
      scrollOffsetY: 0,
      zIndex: 40,
    })
    expect(regions.find((r) => r.id === 'middleLeft')).toEqual({
      id: 'middleLeft',
      rowBand: 'middle',
      colBand: 'left',
      rowRange: [3, 6],
      colRange: [0, 0],
      rect: { x: 0, y: 88, width: 100, height: 112 },
      scrollOffsetX: 0,
      scrollOffsetY: 84,
      zIndex: 20,
    })
    expect(regions.find((r) => r.id === 'middleRight')).toEqual({
      id: 'middleRight',
      rowBand: 'middle',
      colBand: 'right',
      rowRange: [3, 6],
      colRange: [7, 7],
      rect: { x: 300, y: 88, width: 100, height: 112 },
      scrollOffsetX: 700,
      scrollOffsetY: 84,
      zIndex: 20,
    })
    expect(regions.find((r) => r.id === 'main')).toEqual({
      id: 'main',
      rowBand: 'middle',
      colBand: 'center',
      rowRange: [3, 6],
      colRange: [2, 3],
      rect: { x: 100, y: 88, width: 200, height: 112 },
      scrollOffsetX: 200,
      scrollOffsetY: 84,
      zIndex: 10,
    })
  })

  it('兼容旧 left-only quadrants 访问路径', () => {
    const rowsAxis = new ChunkedAxis({ count: 20, defaultSize: 28 })
    const colsAxis = new ChunkedAxis({ count: 8, defaultSize: 100 })
    const frozen = new FrozenRegions(rowsAxis, colsAxis, 2, 1)

    const quadrants = frozen.getQuadrants({
      width: 400,
      height: 200,
      scrollX: 100,
      scrollY: 84,
      headerHeight: 32,
    })

    expect(quadrants.topLeft?.id).toBe('topLeft')
    expect(quadrants.topRight?.id).toBe('topCenter')
    expect(quadrants.bottomLeft?.id).toBe('middleLeft')
    expect(quadrants.main.id).toBe('main')
  })

  it('左冻结列存在时横向滚动立即推动中间区域', () => {
    const rowsAxis = new ChunkedAxis({ count: 20, defaultSize: 28 })
    const colsAxis = new ChunkedAxis({ count: 8, defaultSize: 100 })
    const frozen = new FrozenRegions(rowsAxis, colsAxis, {
      topRows: 0,
      leftCols: 1,
      rightCols: 0,
    })

    const main = frozen
      .getRegions({
        width: 400,
        height: 200,
        scrollX: 50,
        scrollY: 0,
        headerHeight: 32,
      })
      .find((region) => region.id === 'main')!

    // scrollX 表示“中间可滚动区域”已经横向滚动了多少。
    // 左冻结列宽 100px，所以中心区域的内容坐标基准应为 100 + 50 = 150。
    // 如果写成 max(scrollX, leftWidth)，0..100px 这段滚动会被左冻结宽度吞掉，画面要拖一段才动。
    expect(main.scrollOffsetX).toBe(150)
  })

  it('无冻结配置时保持单 main 区域兼容旧路径', () => {
    const rowsAxis = new ChunkedAxis({ count: 20, defaultSize: 28 })
    const colsAxis = new ChunkedAxis({ count: 8, defaultSize: 100 })
    const frozen = new FrozenRegions(rowsAxis, colsAxis, 0, 0)

    const quadrants = frozen.getQuadrants({
      width: 400,
      height: 200,
      scrollX: 100,
      scrollY: 84,
      headerHeight: 32,
    })

    expect(quadrants.topLeft).toBeUndefined()
    expect(quadrants.topRight).toBeUndefined()
    expect(quadrants.bottomLeft).toBeUndefined()
    expect(quadrants.main).toMatchObject({
      id: 'main',
      rowBand: 'middle',
      colBand: 'center',
      rowRange: [3, 8],
      colRange: [1, 4],
      rect: { x: 0, y: 32, width: 400, height: 168 },
      scrollOffsetX: 100,
      scrollOffsetY: 84,
      zIndex: 10,
    })
  })
})
