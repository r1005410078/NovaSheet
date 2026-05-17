import { describe, expect, it } from 'bun:test'
import { stubGlobal, unstubAllGlobals } from '../helpers/global-stub'
import { HighDPI } from '../../src/surface/HighDPI'
import { createRecordingContext } from '../helpers/recording-context'

function mockCanvas(): HTMLCanvasElement {
  return { width: 0, height: 0, style: { width: '', height: '' } } as unknown as HTMLCanvasElement
}

describe('HighDPI — 高 DPR 位图', () => {
  it('canvas 物理尺寸为 css×dpr 并设置 transform', () => {
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

  it('dpr=1 时尺寸与 CSS 一致', () => {
    stubGlobal('devicePixelRatio', 1)
    const canvas = mockCanvas()
    const { ctx } = createRecordingContext()
    new HighDPI(canvas, ctx).resize(100, 50)
    expect(canvas.width).toBe(100)
    expect(canvas.height).toBe(50)
    unstubAllGlobals()
  })

  it('对小数 CSS 尺寸取整', () => {
    stubGlobal('devicePixelRatio', 1.5)
    const canvas = mockCanvas()
    const { ctx } = createRecordingContext()
    new HighDPI(canvas, ctx).resize(100, 50)
    expect(canvas.width).toBe(150)
    expect(canvas.height).toBe(75)
    unstubAllGlobals()
  })

  it('resize 后 getDpr 返回当前 dpr', () => {
    stubGlobal('devicePixelRatio', 2)
    const canvas = mockCanvas()
    const { ctx } = createRecordingContext()
    const h = new HighDPI(canvas, ctx)
    h.resize(100, 100)
    expect(h.getDpr()).toBe(2)
    unstubAllGlobals()
  })
})
