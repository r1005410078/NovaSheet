import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import { getWebMenuItemContributions, getWebMergeCellsContributions } from '@novasheet/web'
import { installMergeCellsFeature } from '../src'

describe('installMergeCellsFeature', () => {
  it('注册 merge-cells controller 与 menu provider', () => {
    const ctx = createSheetContext()
    installMergeCellsFeature(ctx)
    expect(getWebMergeCellsContributions(ctx).map((c) => c.id)).toEqual(['merge-cells'])
    expect(getWebMenuItemContributions(ctx).map((p) => p.id)).toContain('merge-cells-default')
  })
})
