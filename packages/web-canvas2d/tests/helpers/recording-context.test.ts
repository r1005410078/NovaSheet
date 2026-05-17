import { describe, expect, it } from 'bun:test'
import { createRecordingContext } from './recording-context'

describe('RecordingContext2D', () => {
  it('records fillRect calls with arguments', () => {
    const { ctx, ops } = createRecordingContext()
    ctx.fillStyle = '#fff'
    ctx.fillRect(10, 20, 100, 200)
    expect(ops).toEqual([
      { op: 'set:fillStyle', value: '#fff' },
      { op: 'fillRect', args: [10, 20, 100, 200] },
    ])
  })

  it('records save/restore and clip', () => {
    const { ctx, ops } = createRecordingContext()
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, 10, 10)
    ctx.clip()
    ctx.restore()
    expect(ops.map((o) => o.op)).toEqual(['save', 'beginPath', 'rect', 'clip', 'restore'])
  })

  it('measureText returns deterministic width based on string length', () => {
    const { ctx } = createRecordingContext()
    const m = ctx.measureText('abcdef')
    expect(m.width).toBe(6 * 7) // 6 chars × 7px default
  })
})
