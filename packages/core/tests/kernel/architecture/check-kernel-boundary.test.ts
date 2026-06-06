import { describe, expect, it } from 'bun:test'
import { findKernelFeatureImports } from '../../../scripts/check-kernel-boundary'

describe('kernel boundary lint', () => {
  it('reports static imports from kernel files to features', () => {
    const files = new Map([
      ['packages/core/src/kernel/render/RenderFrame.ts', "import type { X } from '../../features/x'\n"],
      ['packages/core/src/kernel/README.md', '`features/x` is documentation only\n'],
      ['packages/core/src/features/row/RowStructure.ts', "import type { X } from '../view/X'\n"],
    ])

    expect(findKernelFeatureImports(files)).toEqual([
      {
        path: 'packages/core/src/kernel/render/RenderFrame.ts',
        line: 1,
        importPath: '../../features/x',
      },
    ])
  })
})
