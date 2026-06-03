import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import { getWebMenuItemContributions, getWebStructureContributions } from '@novasheet/web'
import { installStructureFeature } from '../src'

describe('installStructureFeature', () => {
  it('注册 structure controller 与 column/row menu providers', () => {
    const ctx = createSheetContext()
    installStructureFeature(ctx)
    expect(getWebStructureContributions(ctx).map((c) => c.id)).toEqual(['structure'])
    const ids = getWebMenuItemContributions(ctx).map((p) => p.id)
    expect(ids).toContain('structure-column-default')
    expect(ids).toContain('structure-row-default')
  })
})
