import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import {
  WEB_DRAG_CONTRIBUTION,
  getWebDragContributions,
  registerWebDrag,
  type WebDragContribution,
} from '../../../src'

describe('web drag contributions', () => {
  it('registers typed drag contributions through SheetContext', () => {
    const ctx = createSheetContext()
    const contribution: WebDragContribution = {
      id: 'test-drag',
      order: 10,
      create: () => null,
    }

    registerWebDrag(ctx, contribution)

    expect(ctx.registry.contributions.get(WEB_DRAG_CONTRIBUTION)).toEqual([contribution])
    expect(getWebDragContributions(ctx)).toEqual([contribution])
  })

  it('sorts drag contributions by order', () => {
    const ctx = createSheetContext()

    registerWebDrag(ctx, { id: 'late', order: 20, create: () => null })
    registerWebDrag(ctx, { id: 'early', order: 5, create: () => null })

    expect(getWebDragContributions(ctx).map((item) => item.id)).toEqual(['early', 'late'])
  })

  it('accepts runtime deps with a handle layer for resize features', () => {
    const ctx = createSheetContext()
    const contribution: WebDragContribution = {
      id: 'probe-resize',
      order: 5,
      create: (deps) => {
        expect(deps.handleLayer).toBeDefined()
        return null
      },
    }

    registerWebDrag(ctx, contribution)

    const [registered] = getWebDragContributions(ctx)
    expect(registered?.id).toBe('probe-resize')
  })
})
