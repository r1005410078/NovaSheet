import { describe, expect, it } from 'bun:test'
import {
  findKernelFeatureImports,
  findPureLayerDomViolations,
} from '../../../scripts/check-kernel-boundary'

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

describe('pure-layer DOM boundary lint', () => {
  it('flags pure-layer imports of the dom/ shell and DOM globals', () => {
    const files = new Map([
      ['packages/core/src/features/x/X.ts', "import { Host } from '../../dom/host/Host'\n"],
      ['packages/core/src/engine/Y.ts', 'const el = document.createElement("div")\n'],
      // ports may reference DOM types as boundary contract — only a dom/ import is forbidden there
      ['packages/core/src/ports/RenderBackend.ts', 'mount(container: HTMLElement): void\n'],
      // the dom/ shell itself is allowed to touch DOM
      ['packages/core/src/dom/host/DomGridHost.ts', 'document.body.append(canvas)\n'],
    ])

    expect(findPureLayerDomViolations(files)).toEqual([
      {
        path: 'packages/core/src/features/x/X.ts',
        line: 1,
        detail: "imports DOM shell '../../dom/host/Host'（纯层禁依赖 dom/**）",
      },
      {
        path: 'packages/core/src/engine/Y.ts',
        line: 1,
        detail: "touches DOM global 'document.'（纯层禁触碰 document/window）",
      },
    ])
  })
})
