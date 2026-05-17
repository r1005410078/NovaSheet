import { describe, expect, it } from 'bun:test'
import { createRecordingContext } from './recording-context'

describe('RecordingContext2D — 录制上下文', () => {
  it('记录 fillRect 及参数', () => {
    const { ctx, ops } = createRecordingContext()
    ctx.fillStyle = '#fff'
    ctx.fillRect(10, 20, 100, 200)
    expect(ops).toEqual([
      { op: 'set:fillStyle', value: '#fff' },
      { op: 'fillRect', args: [10, 20, 100, 200] },
    ])
  })

  it('记录 save/restore/clip', () => {
    const { ctx, ops } = createRecordingContext()
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, 10, 10)
    ctx.clip()
    ctx.restore()
    expect(ops.map((o) => o.op)).toEqual(['save', 'beginPath', 'rect', 'clip', 'restore'])
  })

  it('measureText 按字符串长度返回确定性宽度', () => {
    const { ctx } = createRecordingContext()
    const m = ctx.measureText('abcdef')
    expect(m.width).toBe(6 * 7) // 6 chars × 7px default
  })
})
