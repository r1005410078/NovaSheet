import { describe, expect, it } from 'bun:test'
import { createSheetContext, InMemoryDataSource } from '@novasheet/core'
import { Grid } from '../src/Grid'

describe('cell draw extensions', () => {
  it('calls draw for a custom field type during paint', () => {
    const ctx = createSheetContext<CanvasRenderingContext2D, HTMLElement>()
    let drawCount = 0

    ctx.extensions.cell('rating', {
      draw: () => {
        drawCount++
        expect(ctx.cell().value()).toBe(3)
        expect(ctx.canvas().ctx()).toBeTruthy()
      },
    })

    const el = document.createElement('div')
    Object.assign(el.style, { width: '300px', height: '160px' })
    const raf = captureRaf()

    const grid = new Grid(el, {
      data: new InMemoryDataSource({
        schema: { fields: [{ id: 'score', name: 'Score', type: 'rating' as never, width: 120 }] },
        rows: [{ score: 3 }],
      }),
      context: ctx,
    })

    grid.refresh()
    raf.flushAll()

    expect(drawCount).toBeGreaterThan(0)
    grid.destroy()
    raf.restore()
  })
})

function captureRaf(): { flushAll: () => void; restore: () => void } {
  const original = globalThis.requestAnimationFrame
  const callbacks: FrameRequestCallback[] = []
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    callbacks.push(cb)
    return callbacks.length
  }) as typeof requestAnimationFrame
  return {
    flushAll: () => {
      while (callbacks.length > 0) callbacks.shift()?.(performance.now())
    },
    restore: () => {
      globalThis.requestAnimationFrame = original
    },
  }
}
