import { describe, expect, it } from 'bun:test'
import { CANVAS2D_PAINT_LAYERS } from '../../src/render/PaintLayer'

describe('Canvas2D paint layers — Phase 2 分层契约', () => {
  it('固定绘制顺序为 background → content → grid → overlay', () => {
    expect(CANVAS2D_PAINT_LAYERS).toEqual(['background', 'content', 'grid', 'overlay'])
  })
})
