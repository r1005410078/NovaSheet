import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import { getWebDragContributions } from '@novasheet/web'
import { installRowColumnReorder } from '../src'

describe('installRowColumnReorder', () => {
  it('registers row and column reorder drag contributions', () => {
    const ctx = createSheetContext()

    installRowColumnReorder(ctx)

    expect(getWebDragContributions(ctx).map((item) => item.id)).toEqual([
      'column-header-reorder',
      'row-header-reorder',
    ])
  })
})
