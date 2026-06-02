import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import { getWebDragContributions } from '@novasheet/web'
import { installFillHandleFeature } from '../src'

describe('installFillHandleFeature', () => {
  it('注册 fill-handle drag contribution', () => {
    const ctx = createSheetContext()
    installFillHandleFeature(ctx)
    expect(getWebDragContributions(ctx).map((c) => c.id)).toEqual(['fill-handle'])
  })
})
