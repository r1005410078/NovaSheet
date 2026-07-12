import { describe, expect, it } from 'bun:test'
import { DefaultLayoutState } from '../../../src/features/layout/LayoutState'
import { denseGridTheme } from '../../../src/kernel/theme/denseGridTheme'
import { ChunkedAxis } from '../../../src/kernel/geometry/ChunkedAxis'

function makeLayout(depth: number) {
  const layout = new DefaultLayoutState({
    theme: denseGridTheme,
    explicitDefaultRowHeight: undefined,
    excelHeaders: false,
    frozenInput: undefined,
    getSchema: () => ({ fields: [{ id: 'a', name: 'a', type: 'text', width: 100 }] }),
    getGroupHeaderDepth: () => depth,
  })
  const rows = new ChunkedAxis({ count: 10, defaultSize: 32 })
  const cols = new ChunkedAxis({ count: 1, defaultSize: 100 })
  layout.initView(rows, cols)
  return layout
}

describe('LayoutState 表头总高', () => {
  it('无组：headerHeight === leafHeaderHeight === theme.metrics.headerHeight（零成本路径）', () => {
    const snap = makeLayout(0).getViewport().snapshot()
    expect(snap.headerHeight).toBe(denseGridTheme.metrics.headerHeight)
    expect(snap.leafHeaderHeight).toBe(denseGridTheme.metrics.headerHeight)
  })
  it('depth=2：总高 = 2×groupHeaderRowHeight + leaf', () => {
    const snap = makeLayout(2).getViewport().snapshot()
    expect(snap.headerHeight).toBe(
      2 * denseGridTheme.metrics.groupHeaderRowHeight + denseGridTheme.metrics.headerHeight,
    )
    expect(snap.leafHeaderHeight).toBe(denseGridTheme.metrics.headerHeight)
  })
})
