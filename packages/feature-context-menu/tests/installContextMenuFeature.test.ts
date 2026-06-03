import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import { getWebContextMenuContributions, getWebMenuItemContributions } from '@novasheet/web'
import { installContextMenuFeature } from '../src'

describe('installContextMenuFeature', () => {
  it('注册 context-menu controller 与默认 menu-item providers', () => {
    const ctx = createSheetContext()
    installContextMenuFeature(ctx)
    expect(getWebContextMenuContributions(ctx).map((c) => c.id)).toEqual(['context-menu'])
    expect(getWebMenuItemContributions(ctx).map((p) => p.id)).toEqual(['cell-default'])
  })
})
