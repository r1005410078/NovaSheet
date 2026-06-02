import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import { getWebDragContributions } from '@novasheet/web'
import { installResizeFeature } from '../src'

describe('installResizeFeature', () => {
  it('registers the resize drag contribution', () => {
    const ctx = createSheetContext()

    installResizeFeature(ctx)

    expect(getWebDragContributions(ctx).map((contribution) => contribution.id)).toEqual(['resize'])
  })
})
