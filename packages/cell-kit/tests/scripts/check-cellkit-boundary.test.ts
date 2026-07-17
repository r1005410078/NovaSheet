import { describe, expect, it } from 'bun:test'
import { findCellKitBoundaryViolations } from '../../scripts/check-cellkit-boundary'

describe('check-cellkit-boundary', () => {
  it('flags core/canvas2d/react src importing @zhiguang/cell-kit', () => {
    const files = new Map<string, string>([
      ['/repo/packages/core/src/foo.ts', `import { x } from '@zhiguang/cell-kit'`],
      ['/repo/packages/canvas2d/src/bar.ts', `import type { Y } from '@zhiguang/cell-kit/rich-text'`],
      ['/repo/packages/react/src/baz.ts', `import { z } from '@zhiguang/cell-kit'`],
    ])
    const v = findCellKitBoundaryViolations(files)
    expect(v.length).toBe(3)
    expect(v[0]?.path).toContain('core')
  })

  it('allows cell-kit itself importing core/canvas2d/react', () => {
    const files = new Map<string, string>([
      ['/repo/packages/cell-kit/src/a.ts', `import { Grid } from '@zhiguang/core'`],
      ['/repo/packages/apps/storybook/x.ts', `import { richTextExtension } from '@zhiguang/cell-kit'`],
    ])
    expect(findCellKitBoundaryViolations(files).length).toBe(0)
  })
})
