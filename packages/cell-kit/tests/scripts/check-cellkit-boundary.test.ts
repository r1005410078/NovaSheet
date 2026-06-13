import { describe, expect, it } from 'bun:test'
import { findCellKitBoundaryViolations } from '../../scripts/check-cellkit-boundary'

describe('check-cellkit-boundary', () => {
  it('flags core/canvas2d/react src importing @novasheet/cell-kit', () => {
    const files = new Map<string, string>([
      ['/repo/packages/core/src/foo.ts', `import { x } from '@novasheet/cell-kit'`],
      ['/repo/packages/canvas2d/src/bar.ts', `import type { Y } from '@novasheet/cell-kit/rich-text'`],
      ['/repo/packages/react/src/baz.ts', `import { z } from '@novasheet/cell-kit'`],
    ])
    const v = findCellKitBoundaryViolations(files)
    expect(v.length).toBe(3)
    expect(v[0]?.path).toContain('core')
  })

  it('allows cell-kit itself importing core/canvas2d/react', () => {
    const files = new Map<string, string>([
      ['/repo/packages/cell-kit/src/a.ts', `import { Grid } from '@novasheet/core'`],
      ['/repo/packages/apps/storybook/x.ts', `import { richTextExtension } from '@novasheet/cell-kit'`],
    ])
    expect(findCellKitBoundaryViolations(files).length).toBe(0)
  })
})
