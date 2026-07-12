import { describe, expect, it, mock } from 'bun:test'
import { ViewportController } from '../../../../src/dom/runtime/controllers/ViewportController'
import type { GridEngine } from '../../../../src/engine/GridEngine'
import type { WebHost } from '../../../../src/dom/host/Host'
import type { RenderBackend } from '../../../../src/ports/RenderBackend'
import type { Axis } from '../../../../src/kernel/geometry/ChunkedAxis'

/** 简易连续等宽/变宽 Axis stub：仅实现 ViewportController 实际读取的成员。 */
function makeAxis(sizes: readonly number[]): Axis {
  const positions: number[] = []
  let acc = 0
  for (const s of sizes) {
    positions.push(acc)
    acc += s
  }
  return {
    getCount: () => sizes.length,
    getSize: (i: number) => sizes[i] ?? 0,
    indexToPosition: (i: number) => positions[i] ?? 0,
    getTotalSize: () => sizes.reduce((sum, s) => sum + s, 0),
  } as unknown as Axis
}

/** 构造一个满足 ViewportController 各方法读取字段的 GridEngine stub。 */
function makeEngine(overrides: Partial<Record<string, unknown>> = {}) {
  const rowsAxis = makeAxis(Array.from({ length: 10 }, () => 100))
  const colsAxis = makeAxis([200, 200, 200])
  const frame = {
    colsAxis,
    rowsAxis,
    theme: { metrics: { headerHeight: 30 } },
    viewport: { rowHeaderWidth: 0, headerHeight: 30 },
  }
  const base = {
    setViewportSize: mock(() => {}),
    setScroll: mock(() => {}),
    getRowsTotalSize: () => 1000,
    getColsTotalSize: () => 600,
    getTheme: () => ({ metrics: { headerHeight: 30 } }),
    getViewport: () => ({ getRowHeaderWidth: () => 0, getHeaderHeight: () => 30 }),
    getRowsAxis: () => rowsAxis,
    getColsAxis: () => colsAxis,
    getFrozenConfig: () => ({ topRows: 0, leftCols: 0, rightCols: 0 }),
    getColumnIndex: (fieldId: string) => (fieldId === 'b' ? 1 : -1),
    getFrame: () => frame,
    getSelection: () => ({ activeCell: { rowIndex: 1, colIndex: 1 }, extentCell: null }),
    ...overrides,
  }
  return base as unknown as GridEngine
}

function makeHost(overrides: Partial<Record<string, unknown>> = {}) {
  const base = {
    getContainerSize: () => ({ width: 300, height: 200 }),
    getDpr: () => 2,
    getScrollPosition: () => ({ scrollTop: 0, scrollLeft: 0 }),
    setScrollSize: mock(() => {}),
    scrollTo: mock((_top: number, _left: number) => {}),
    ...overrides,
  }
  return base as unknown as WebHost
}

/** deps 公共部分工厂：仅覆盖单个测试关心的回调。 */
function makeDeps(opts: {
  engine: GridEngine
  host: WebHost
  scheduler?: { schedule: (key: string, cb: () => void) => void; cancel: (key: string) => void }
  isDestroyed?: () => boolean
  invalidate?: () => void
  paintSync?: () => void
  renderer?: RenderBackend
  beforeApplyScroll?: (source: unknown) => void
  afterApplyScroll?: () => void
}) {
  return {
    engine: opts.engine,
    host: opts.host,
    scheduler: opts.scheduler ?? { schedule: (_k: string, cb: () => void) => cb(), cancel: () => {} },
    isDestroyed: opts.isDestroyed ?? (() => false),
    invalidate: opts.invalidate ?? (() => {}),
    paintSync: opts.paintSync ?? (() => {}),
    getRenderer: () => opts.renderer ?? ({ resize: mock(() => {}) } as unknown as RenderBackend),
    beforeApplyScroll: opts.beforeApplyScroll ?? (() => {}),
    afterApplyScroll: opts.afterApplyScroll ?? (() => {}),
  }
}

describe('ViewportController — scheduleHostResize', () => {
  it('单 RAF 内完成 viewport 尺寸、renderer.resize 与 paintSync', () => {
    const engine = {
      setViewportSize: mock(() => {}),
      setScroll: mock(() => {}),
      getRowsTotalSize: () => 0,
      getColsTotalSize: () => 0,
      getTheme: () => ({ metrics: { headerHeight: 0 } }),
      getViewport: () => ({ getRowHeaderWidth: () => 0, getHeaderHeight: () => 0 }),
      getFrame: () => ({ colsAxis: { getTotalSize: () => 0, getCount: () => 0 } }),
    } as unknown as GridEngine
    const host = {
      getContainerSize: () => ({ width: 400, height: 300 }),
      getDpr: () => 2,
      getScrollPosition: () => ({ scrollTop: 0, scrollLeft: 0 }),
      setScrollSize: mock(() => {}),
      scrollTo: mock(() => {}),
    } as unknown as WebHost
    const renderer = { resize: mock(() => {}) } as unknown as RenderBackend
    const paintSync = mock(() => {})
    const scheduled: (() => void)[] = []
    const vp = new ViewportController({
      engine,
      host,
      scheduler: { schedule: (_k: string, cb: () => void) => { scheduled.push(cb) }, cancel: () => {} },
      isDestroyed: () => false,
      invalidate: () => {},
      paintSync,
      getRenderer: () => renderer,
      beforeApplyScroll: () => {},
      afterApplyScroll: () => {},
    })
    vp.scheduleHostResize()
    expect(paintSync).not.toHaveBeenCalled()
    for (const cb of scheduled) cb()
    expect(engine.setViewportSize).toHaveBeenCalledWith(400, 300)
    expect(renderer.resize).toHaveBeenCalledWith(400, 300, 2)
    expect(paintSync).toHaveBeenCalledTimes(1)
  })

  it('isDestroyed() 为 true 时不入队', () => {
    const engine = makeEngine()
    const host = makeHost()
    const schedule = mock((_k: string, _cb: () => void) => {})
    const vp = new ViewportController(
      makeDeps({ engine, host, scheduler: { schedule, cancel: () => {} }, isDestroyed: () => true }),
    )
    vp.scheduleHostResize()
    expect(schedule).not.toHaveBeenCalled()
  })

  it('handleHostResize/handleHostDprChange/onContainerResize 都经 host:resize key 合帧', () => {
    const engine = makeEngine()
    const host = makeHost()
    const keys: string[] = []
    const schedule = mock((k: string, cb: () => void) => { keys.push(k); cb() })
    const vp = new ViewportController(makeDeps({ engine, host, scheduler: { schedule, cancel: () => {} } }))
    vp.handleHostResize(300, 200, 2)
    vp.handleHostDprChange(2)
    vp.onContainerResize()
    expect(keys).toEqual(['host:resize', 'host:resize', 'host:resize'])
  })
})

describe('ViewportController — handleHostScroll', () => {
  it('beforeApplyScroll → engine.setScroll → afterApplyScroll → invalidate 顺序不变', () => {
    const engine = makeEngine()
    const host = makeHost()
    const order: string[] = []
    const vp = new ViewportController(
      makeDeps({
        engine,
        host,
        beforeApplyScroll: () => order.push('before'),
        afterApplyScroll: () => order.push('after'),
        invalidate: () => order.push('invalidate'),
      }),
    )
    vp.handleHostScroll(50, 20, { kind: 'scrollbar', atMs: 1 })
    expect(order).toEqual(['before', 'after', 'invalidate'])
    expect(engine.setScroll).toHaveBeenCalledTimes(1)
  })
})

describe('ViewportController — spacer 与滚动边界', () => {
  it('resizeSpacer 按内容尺寸 + headerHeight 调用 host.setScrollSize', () => {
    const engine = makeEngine()
    const host = makeHost()
    const vp = new ViewportController(makeDeps({ engine, host }))
    vp.resizeSpacer()
    // w = colsTotal(600) + rowHeaderWidth(0)；h = rowsTotal(1000) + headerHeight(30)
    expect(host.setScrollSize).toHaveBeenCalledWith(600, 1030)
  })

  it('getScrollLimits 按 spacer - viewport 计算最大可滚边界', () => {
    const engine = makeEngine()
    const host = makeHost()
    const vp = new ViewportController(makeDeps({ engine, host }))
    expect(vp.getScrollLimits()).toEqual({ maxTop: 1030 - 200, maxLeft: 600 - 300 })
  })

  it('getColsContentWidth = colsTotal + rowHeaderWidth（Excel gutter）', () => {
    const engine = makeEngine({ getViewport: () => ({ getRowHeaderWidth: () => 40, getHeaderHeight: () => 30 }) })
    const host = makeHost()
    const vp = new ViewportController(makeDeps({ engine, host }))
    expect(vp.getColsContentWidth()).toBe(640)
  })

  it('getColsTotalSizeForFrame 优先用 axis.getTotalSize', () => {
    const engine = makeEngine()
    const host = makeHost()
    const vp = new ViewportController(makeDeps({ engine, host }))
    expect(vp.getColsTotalSizeForFrame(engine.getFrame())).toBe(600)
  })
})

describe('ViewportController — 程序化滚动', () => {
  it('scrollToRow 按 align=start 滚到行顶部，scrollLeft 保持不变', () => {
    const engine = makeEngine()
    const host = makeHost({ getScrollPosition: () => ({ scrollTop: 0, scrollLeft: 5 }) })
    const vp = new ViewportController(makeDeps({ engine, host }))
    vp.scrollToRow(3, 'start')
    expect(host.scrollTo).toHaveBeenCalledWith(300, 5)
  })

  it('scrollToRow 越界 rowIndex 是 no-op', () => {
    const engine = makeEngine()
    const host = makeHost()
    const vp = new ViewportController(makeDeps({ engine, host }))
    vp.scrollToRow(-1)
    vp.scrollToRow(999)
    expect(host.scrollTo).not.toHaveBeenCalled()
  })

  it('scrollToCell 滚到目标单元格左上角', () => {
    const engine = makeEngine()
    const host = makeHost()
    const vp = new ViewportController(makeDeps({ engine, host }))
    vp.scrollToCell(2, 'b')
    expect(host.scrollTo).toHaveBeenCalledWith(200, 200)
  })

  it('scrollToCell 未知 fieldId 是 no-op', () => {
    const engine = makeEngine()
    const host = makeHost()
    const vp = new ViewportController(makeDeps({ engine, host }))
    vp.scrollToCell(2, 'missing')
    expect(host.scrollTo).not.toHaveBeenCalled()
  })

  // 读取 host.scrollTo 最近一次调用的 [top, left]（logicalToScroll 含 FP 除法，用 closeTo 断言）。
  function lastScrollTo(host: WebHost): [number, number] {
    const calls = (host.scrollTo as unknown as { mock: { calls: [number, number][] } }).mock.calls
    return calls.at(-1)!
  }

  // 冻结左列偏移：横轴 vp.scrollX 是「中心区相对」坐标，scrollToCell 须减去左冻结列宽。
  it('scrollToCell 在 frozen.leftCols>0 时减去左冻结列宽（目标对齐中心区左缘，非藏在冻结列后）', () => {
    // colsAxis=[200,200,200]，冻结 col0（宽 200）。目标 col 'b'(idx1) 绝对 left=200。
    const engine = makeEngine({ getFrozenConfig: () => ({ topRows: 0, leftCols: 1, rightCols: 0 }) })
    const host = makeHost()
    const vp = new ViewportController(makeDeps({ engine, host }))
    vp.scrollToCell(2, 'b')
    // scrollLeft = logicalToScrollX(200 − 200) = 0（col1 落到中心区左缘）；纵轴不受冻结影响仍 200。
    const [top, left] = lastScrollTo(host)
    expect(top).toBeCloseTo(200, 6)
    expect(left).toBeCloseTo(0, 6)
  })

  // 冻结顶行偏移：纵轴 align=end 须按「中间行带高」= 视口高 − 表头 − 顶冻结行高对齐。
  it('scrollToRow align=end 在 frozen.topRows>0 时按中间行带高对齐（不被顶冻结行盖住）', () => {
    // rowsAxis=10×100，冻结 row0（高 100）。视口高 200、表头 30 → 中间行带高 70。
    const engine = makeEngine({ getFrozenConfig: () => ({ topRows: 1, leftCols: 0, rightCols: 0 }) })
    const host = makeHost()
    const vp = new ViewportController(makeDeps({ engine, host }))
    vp.scrollToRow(5, 'end')
    // top=500,size=100 → middleScrollY = 500+100−70 = 530（row5 底缘贴中间行带底）。纵轴无减法。
    const [top, left] = lastScrollTo(host)
    expect(top).toBeCloseTo(530, 6)
    expect(left).toBeCloseTo(0, 6)
  })

  // 纵轴 align=start 在 frozen.topRows>0 下**不**做 topHeight 减法（否则打偏一整个冻结行高）。
  it('scrollToRow align=start 在 frozen.topRows>0 下 vp.scrollY 直接取行绝对 top', () => {
    const engine = makeEngine({ getFrozenConfig: () => ({ topRows: 1, leftCols: 0, rightCols: 0 }) })
    const host = makeHost()
    const vp = new ViewportController(makeDeps({ engine, host }))
    vp.scrollToRow(5, 'start')
    const [top, left] = lastScrollTo(host)
    expect(top).toBeCloseTo(500, 6) // = indexToPosition(5)，无 −topHeight
    expect(left).toBeCloseTo(0, 6)
  })
})

describe('ViewportController — 选区滚入可见区域', () => {
  it('getSelectionScrollTarget 优先返回 extentCell，退化到 activeCell', () => {
    const engine = makeEngine({
      getSelection: () => ({ activeCell: { rowIndex: 0, colIndex: 0 }, extentCell: { rowIndex: 4, colIndex: 2 } }),
    })
    const host = makeHost()
    const vp = new ViewportController(makeDeps({ engine, host }))
    expect(vp.getSelectionScrollTarget()).toEqual({ rowIndex: 4, colIndex: 2 })
  })

  it('ensureCellVisible 计算 reveal 后滚动 host 并经 handleHostScroll 回写 engine.setScroll', () => {
    const engine = makeEngine()
    const host = makeHost()
    const invalidate = mock(() => {})
    const vp = new ViewportController(makeDeps({ engine, host, invalidate }))
    // row 5 (top=500,size=100) 在 200px 高、30px header 的视口外，需要下滚
    vp.ensureCellVisible({ rowIndex: 5, colIndex: 0 })
    expect(host.scrollTo).toHaveBeenCalledWith(430, 0)
    expect(engine.setScroll).toHaveBeenCalledWith(0, 430)
    expect(invalidate).toHaveBeenCalledTimes(1)
  })

  it('单元格已可见时 ensureCellVisible 不触发滚动', () => {
    const engine = makeEngine()
    const host = makeHost()
    const vp = new ViewportController(makeDeps({ engine, host }))
    vp.ensureCellVisible({ rowIndex: 0, colIndex: 0 })
    expect(host.scrollTo).not.toHaveBeenCalled()
  })

  // 冻结区内的格恒可见：computeScrollReveal 因绝对坐标落在中心区左缘外会返回非 null，
  // 但两轴都落回当前值时须早退，避免伪 scrollTo（否则会误触 afterApplyScroll 关编辑器）。
  it('frozen 列内的格已可见时 ensureCellVisible 不触发滚动（早退守卫）', () => {
    const engine = makeEngine({ getFrozenConfig: () => ({ topRows: 0, leftCols: 1, rightCols: 0 }) })
    const host = makeHost()
    const vp = new ViewportController(makeDeps({ engine, host }))
    vp.ensureCellVisible({ rowIndex: 0, colIndex: 0 })
    expect(host.scrollTo).not.toHaveBeenCalled()
  })
})

describe('ViewportController — destroy', () => {
  it('destroy 取消 host:resize 挂起任务', () => {
    const engine = makeEngine()
    const host = makeHost()
    const cancel = mock((_k: string) => {})
    const vp = new ViewportController(
      makeDeps({ engine, host, scheduler: { schedule: () => {}, cancel } }),
    )
    vp.destroy()
    expect(cancel).toHaveBeenCalledWith('host:resize')
  })
})
