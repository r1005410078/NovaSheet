import { describe, expect, it } from 'bun:test'
import { DefaultLayoutState } from '../../../src/engine/layout/LayoutState'
import { denseGridTheme } from '../../../src/theme/denseGridTheme'
import type { Schema } from '../../../src/data/Schema'

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
