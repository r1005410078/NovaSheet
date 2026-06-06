import { describe, expect, it } from 'bun:test'
import { DefaultLayoutState } from '../../../src/engine/layout/LayoutState'
import { denseGridTheme } from '../../../src/kernel/theme/denseGridTheme'
import type { Schema } from '../../../src/kernel/data/Schema'
import { ChunkedAxis } from '../../../src/kernel/geometry/ChunkedAxis'

function axis(count: number, defaultSize: number): ChunkedAxis {
  return new ChunkedAxis({ count, defaultSize })
}

function schemaOf(widths: readonly number[]): Schema {
  return { fields: widths.map((w, i) => ({ id: `f${i}`, name: `F${i}`, type: 'text', width: w })) }
}

function makeLayout(opts?: {
  explicitDefaultRowHeight?: number
  excelHeaders?: boolean
  frozenInput?: { topRows?: number; leftCols?: number; rightCols?: number }
  widths?: readonly number[]
}) {
  return new DefaultLayoutState({
    theme: denseGridTheme,
    explicitDefaultRowHeight: opts?.explicitDefaultRowHeight,
    excelHeaders: opts?.excelHeaders ?? false,
    frozenInput: opts?.frozenInput,
    getSchema: () => schemaOf(opts?.widths ?? [100, 100, 100]),
  })
}

describe('DefaultLayoutState 默认值派生', () => {
  it('resolveDefaultRowHeight：显式优先，否则取 theme', () => {
    expect(makeLayout({ explicitDefaultRowHeight: 32 }).resolveDefaultRowHeight()).toBe(32)
    expect(makeLayout().resolveDefaultRowHeight()).toBe(denseGridTheme.metrics.rowHeight)
  })

  it('averageColWidth：四舍五入平均，下界 1，空 schema 返回 100', () => {
    expect(makeLayout({ widths: [80, 100, 120] }).averageColWidth()).toBe(100)
    expect(makeLayout({ widths: [10, 11] }).averageColWidth()).toBe(11) // round(10.5)=11(银行家舍入不适用，JS Math.round)
    expect(makeLayout({ widths: [] }).averageColWidth()).toBe(100)
  })
})

describe('DefaultLayoutState 视图装配与 rebuild', () => {
  it('initView：装配 viewport（theme header）+ frozen（首次用 initial 配置）', () => {
    const layout = makeLayout({ frozenInput: { leftCols: 1 } })
    layout.initView(axis(10, 24), axis(3, 100))
    expect(layout.getFrozenConfig()).toEqual({ topRows: 0, leftCols: 1, rightCols: 0 })
    expect(layout.getViewport().snapshot().headerHeight).toBe(denseGridTheme.metrics.headerHeight)
    expect(layout.getRowsAxis().getTotalSize()).toBe(10 * 24)
    expect(layout.getColsAxis().getTotalSize()).toBe(3 * 100)
  })

  it('rebuildRows：换 rowsAxis 并保留 viewport snapshot（size/scroll/header）', () => {
    const layout = makeLayout()
    layout.initView(axis(10, 24), axis(3, 100))
    layout.setViewportSize(300, 200)
    layout.setScroll(0, 50)
    layout.setHeaderHeight(40)
    layout.rebuildRows(axis(20, 24))
    const snap = layout.getViewport().snapshot()
    expect(layout.getRowsAxis().getTotalSize()).toBe(20 * 24)
    expect(snap.contentRect).toEqual({ width: 300, height: 200 })
    expect(snap.scrollY).toBe(50)
    expect(snap.headerHeight).toBe(40)
  })

  it('rebuildCols：换 colsAxis 并保留 snapshot', () => {
    const layout = makeLayout()
    layout.initView(axis(10, 24), axis(3, 100))
    layout.setViewportSize(300, 200)
    layout.rebuildCols(axis(5, 100))
    expect(layout.getColsAxis().getTotalSize()).toBe(5 * 100)
    expect(layout.getViewport().snapshot().contentRect).toEqual({ width: 300, height: 200 })
  })

  it('initView 二次调用（setData 语义）：用当前 live frozen 配置而非 initial', () => {
    const layout = makeLayout({ frozenInput: { leftCols: 1 } })
    layout.initView(axis(10, 24), axis(3, 100))
    layout.setFrozenConfig({ leftCols: 2 })
    layout.initView(axis(8, 24), axis(4, 100)) // 模拟 setData 重新装配
    expect(layout.getFrozenConfig()).toEqual({ topRows: 0, leftCols: 2, rightCols: 0 })
  })

  it('excelHeaders：initView 后 row-header gutter 取 max(theme, 44)', () => {
    const layout = makeLayout({ excelHeaders: true })
    layout.initView(axis(10, 24), axis(3, 100))
    const expected = Math.max(denseGridTheme.metrics.rowHeaderWidth, 44)
    expect(layout.getViewport().snapshot().rowHeaderWidth).toBe(expected)
  })
})

describe('DefaultLayoutState applyTheme 与 frozen remap', () => {
  it('applyTheme：换 theme header + 重算 excel gutter', () => {
    const layout = makeLayout({ excelHeaders: true })
    layout.initView(axis(10, 24), axis(3, 100))
    const themed = {
      ...denseGridTheme,
      metrics: { ...denseGridTheme.metrics, headerHeight: 99, rowHeaderWidth: 60 },
    }
    layout.applyTheme(themed)
    const snap = layout.getViewport().snapshot()
    expect(snap.headerHeight).toBe(99)
    expect(snap.rowHeaderWidth).toBe(Math.max(60, 44))
  })

  it('remapFrozenAfterColInsert：插入落在左冻结区内 → leftCols 增长', () => {
    const layout = makeLayout({ frozenInput: { leftCols: 2, rightCols: 1 } })
    layout.initView(axis(10, 24), axis(5, 100))
    // 在 at=1 插 2 列；oldTotalCols=5。at(1) < leftCols(2) → left+2；rightCols>0 且 at(1) >= 5-1=4? 否。
    layout.remapFrozenAfterColInsert(1, 2, 5)
    expect(layout.getFrozenConfig()).toEqual({ topRows: 0, leftCols: 4, rightCols: 1 })
  })

  it('remapFrozenAfterColInsert：插入落在右冻结边界 → rightCols 增长', () => {
    const layout = makeLayout({ frozenInput: { leftCols: 1, rightCols: 2 } })
    layout.initView(axis(10, 24), axis(6, 100))
    // at=5 插 1 列；oldTotalCols=6；at(5) < left(1)? 否。right>0 且 at(5) >= 6-2=4 → right+1。
    layout.remapFrozenAfterColInsert(5, 1, 6)
    expect(layout.getFrozenConfig()).toEqual({ topRows: 0, leftCols: 1, rightCols: 3 })
  })

  it('remapFrozenAfterColDelete：删除命中左右冻结区 → 各自收缩，下界 0', () => {
    const layout = makeLayout({ frozenInput: { leftCols: 2, rightCols: 2 } })
    layout.initView(axis(10, 24), axis(6, 100))
    // totalColsBefore=6；删 [0, 5]：left 命中 idx<2 → 1 个；rightBoundary=6-2=4，idx>=4 → 1 个。
    layout.remapFrozenAfterColDelete([0, 5], 6)
    expect(layout.getFrozenConfig()).toEqual({ topRows: 0, leftCols: 1, rightCols: 1 })
  })
})
