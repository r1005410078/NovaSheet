import { describe, expect, it } from 'bun:test'
import { ChunkedAxis } from '../../src/geometry/ChunkedAxis'
import { FrozenRegions } from '../../src/geometry/FrozenRegions'

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
      rowHeaderWidth: 0,
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

  it('不再暴露旧 quadrants 访问路径', () => {
    const rowsAxis = new ChunkedAxis({ count: 20, defaultSize: 28 })
    const colsAxis = new ChunkedAxis({ count: 8, defaultSize: 100 })
    const frozen = new FrozenRegions(rowsAxis, colsAxis, {
      topRows: 2,
      leftCols: 1,
      rightCols: 0,
    })

    expect('getQuadrants' in frozen).toBe(false)
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
        rowHeaderWidth: 0,
      })
      .find((region) => region.id === 'main')!

    // scrollX 表示“中间可滚动区域”已经横向滚动了多少。
    // 左冻结列宽 100px，所以中心区域的内容坐标基准应为 100 + 50 = 150。
    // 如果写成 max(scrollX, leftWidth)，0..100px 这段滚动会被左冻结宽度吞掉，画面要拖一段才动。
    expect(main.scrollOffsetX).toBe(150)
  })

  it('rowHeaderWidth 为内容区整体右移并收窄中间列', () => {
    const rowsAxis = new ChunkedAxis({ count: 20, defaultSize: 28 })
    const colsAxis = new ChunkedAxis({ count: 8, defaultSize: 100 })
    const frozen = new FrozenRegions(rowsAxis, colsAxis, {})
    const main = frozen
      .getRegions({
        width: 400,
        height: 200,
        scrollX: 0,
        scrollY: 0,
        headerHeight: 32,
        rowHeaderWidth: 44,
      })
      .find((r) => r.id === 'main')!

    expect(main.rect).toEqual({ x: 44, y: 32, width: 356, height: 168 })
  })

  it('无冻结配置时只返回单 main 区域', () => {
    const rowsAxis = new ChunkedAxis({ count: 20, defaultSize: 28 })
    const colsAxis = new ChunkedAxis({ count: 8, defaultSize: 100 })
    const frozen = new FrozenRegions(rowsAxis, colsAxis, {})

    const regions = frozen.getRegions({
      width: 400,
      height: 200,
      scrollX: 100,
      scrollY: 84,
      headerHeight: 32,
      rowHeaderWidth: 0,
    })

    expect(regions).toHaveLength(1)
    expect(regions[0]).toMatchObject({
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
