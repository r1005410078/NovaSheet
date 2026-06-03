import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import { registerWebSortFilter, getWebSortFilterContributions } from '../../src/sort-filter/WebSortFilter'

describe('web.sort-filter contribution', () => {
  it('registerWebSortFilter 按 order 排序', () => {
    const ctx = createSheetContext()
    registerWebSortFilter(ctx, { id: 'b', order: 20, create: () => null })
    registerWebSortFilter(ctx, { id: 'a', order: 10, create: () => null })
    expect(getWebSortFilterContributions(ctx).map((c) => c.id)).toEqual(['a', 'b'])
  })
})
