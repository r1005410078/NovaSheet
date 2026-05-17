import { describe, expect, it } from 'bun:test'
import { stubGlobal, unstubAllGlobals } from '../helpers/global-stub'
import { HighDPI } from '../../src/surface/HighDPI'
import { createRecordingContext } from '../helpers/recording-context'

function mockCanvas(): HTMLCanvasElement {
  return { width: 0, height: 0, style: { width: '', height: '' } } as unknown as HTMLCanvasElement
}

describe('HighDPI', () => {
  it('sets canvas dimensions to css * dpr and applies transform', () => {
    stubGlobal('devicePixelRatio', 2)
    const canvas = mockCanvas()
    const { ctx, ops } = createRecordingContext()
    const h = new HighDPI(canvas, ctx)
    h.resize(400, 300)
    expect(canvas.style.width).toBe('400px')
    expect(canvas.style.height).toBe('300px')
    expect(canvas.width).toBe(800)
    expect(canvas.height).toBe(600)
    expect(ops).toContainEqual({ op: 'setTransform', args: [2, 0, 0, 2, 0, 0] })
    unstubAllGlobals()
  })

  it('handles dpr = 1', () => {
    stubGlobal('devicePixelRatio', 1)
    const canvas = mockCanvas()
    const { ctx } = createRecordingContext()
    new HighDPI(canvas, ctx).resize(100, 50)
    expect(canvas.width).toBe(100)
    expect(canvas.height).toBe(50)
    unstubAllGlobals()
  })

  it('rounds fractional css dimensions', () => {
    stubGlobal('devicePixelRatio', 1.5)
    const canvas = mockCanvas()
    const { ctx } = createRecordingContext()
    new HighDPI(canvas, ctx).resize(100, 50)
    expect(canvas.width).toBe(150)
    expect(canvas.height).toBe(75)
    unstubAllGlobals()
  })

  it('reports current dpr after resize', () => {
    stubGlobal('devicePixelRatio', 2)
    const canvas = mockCanvas()
    const { ctx } = createRecordingContext()
    const h = new HighDPI(canvas, ctx)
    h.resize(100, 100)
    expect(h.getDpr()).toBe(2)
    unstubAllGlobals()
  })
})
