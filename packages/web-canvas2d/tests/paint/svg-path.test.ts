import { describe, expect, it } from 'bun:test'
import { paintSvgPath } from '../../src/paint/svg-path'
import { createRecordingContext } from '../helpers/recording-context'

describe('paintSvgPath', () => {
  it('等比缩放，不拉伸变形', () => {
    const { ctx, ops } = createRecordingContext()
    paintSvgPath(ctx, 'M0 0h96v58H0z', { width: 96, height: 58 }, { x: 0, y: 0, width: 48, height: 48 }, {
      fill: '#fff',
    })

    const scales = ops.filter((o) => o.op === 'scale')
    expect(scales).toHaveLength(1)
    expect(scales[0]).toEqual({ op: 'scale', args: [0.5, 0.5] })
  })
})
