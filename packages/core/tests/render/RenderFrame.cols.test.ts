import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import { denseGridTheme } from '../../src/theme/denseGridTheme'

describe('RenderFrame.collapsedColGaps', () => {
  it('hide cols 后 frame.collapsedColGaps 含一项 + xPx 落在 view-col 右边界', () => {
    const fields = Array.from({ length: 10 }, (_, i) => ({
      id: `f${i}`,
      name: `F${i}`,
      type: 'text' as const,
      width: 50,
    }))
    const ds = new InMemoryDataSource({
      schema: { fields },
      rows: [Object.fromEntries(fields.map((field) => [field.id, 'v']))],
    })
    const engine = new DefaultGridEngine({ data: ds, theme: denseGridTheme })
    engine.setViewportSize(800, 400)
    engine.hideCols(['f3', 'f4', 'f5'])

    const frame = engine.getFrame()

    expect(frame.collapsedColGaps).toHaveLength(1)
    const gap = frame.collapsedColGaps[0]!
    expect(gap.atViewCol).toBe(2)
    expect(gap.hiddenCount).toBe(3)
    expect(gap.hiddenFieldIds).toEqual(['f3', 'f4', 'f5'])
    expect(gap.xPx).toBeGreaterThan(0)
  })
})
