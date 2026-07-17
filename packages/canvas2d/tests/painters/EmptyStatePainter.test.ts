import { describe, expect, it } from 'bun:test'
import { denseGridTheme } from '@zhiguang/core'
import { EmptyStatePainter } from '../../src/painters/EmptyStatePainter'
import { createRecordingContext } from '../helpers/recording-context'

describe('EmptyStatePainter', () => {
  it('绘制插画路径与文案', () => {
    const { ctx, ops } = createRecordingContext(400, 300)
    const painter = new EmptyStatePainter(denseGridTheme)
    painter.paint(ctx, { rect: { x: 0, y: 32, width: 400, height: 268 } })

    expect(ops.some((o) => o.op === 'fillPath')).toBe(true)
    expect(ops.some((o) => o.op === 'strokePath')).toBe(true)
    const texts = ops
      .filter((o) => o.op === 'fillText')
      .map((o) => (o.op === 'fillText' ? o.args[0] : ''))
    expect(texts).toContain(denseGridTheme.emptyState.title)
    expect(texts).toContain(denseGridTheme.emptyState.subtitle)
  })
})
