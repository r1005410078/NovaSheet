import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import { getWebSortFilterContributions, getWebMenuItemContributions } from '@novasheet/web'
import { installSortFilterFeature } from '../src'

describe('installSortFilterFeature', () => {
  it('注册 sort-filter controller 与 menu-item provider', () => {
    const ctx = createSheetContext()
    installSortFilterFeature(ctx)
    expect(getWebSortFilterContributions(ctx).map((c) => c.id)).toEqual(['sort-filter'])
    expect(getWebMenuItemContributions(ctx).map((p) => p.id)).toContain('sort-filter-default')
  })
})
