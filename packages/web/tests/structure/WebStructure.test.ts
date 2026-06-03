import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import { getWebStructureContributions, registerWebStructure } from '../../src/structure/WebStructure'

describe('web.structure contribution', () => {
  it('registerWebStructure 按 order 排序', () => {
    const ctx = createSheetContext()
    registerWebStructure(ctx, { id: 'b', order: 20, create: () => null })
    registerWebStructure(ctx, { id: 'a', order: 10, create: () => null })
    expect(getWebStructureContributions(ctx).map((c) => c.id)).toEqual(['a', 'b'])
  })
})
