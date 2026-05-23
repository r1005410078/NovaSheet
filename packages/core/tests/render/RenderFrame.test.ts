import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'
import { denseGridTheme } from '../../src/theme/denseGridTheme'

describe('RenderFrame.collapsedRowGaps', () => {
  it('hide 行后 frame.collapsedRowGaps 含一项 + yPx 落在 view-row 下边界', () => {
    const ds = new InMemoryDataSource({
      schema: { fields: [{ id: 'a', name: 'A', type: 'text' as const, width: 100 }] },
      rows: Array.from({ length: 10 }, (_, i) => ({ a: `r${i}` })),
    })
    const engine = new DefaultGridEngine({ data: ds, theme: denseGridTheme })
    engine.setViewportSize(200, 400)
    engine.setScroll(0, 0)
    engine.hideRows([3, 4, 5])
    const frame = engine.getFrame()
    expect(frame.collapsedRowGaps).toHaveLength(1)
    const gap = frame.collapsedRowGaps[0]!
    expect(gap.atViewRow).toBe(2)
    expect(gap.hiddenCount).toBe(3)
    expect(gap.yPx).toBeGreaterThan(0)
  })
})
