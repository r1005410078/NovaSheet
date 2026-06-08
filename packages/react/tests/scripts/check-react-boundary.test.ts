import { describe, expect, it } from 'bun:test'

import {
  classifyReactLayer,
  findReactBoundaryViolations,
  resolveInternalImport,
} from '../../scripts/check-react-boundary'

describe('react boundary lint', () => {
  it('classifies layers under packages/react/src', () => {
    expect(classifyReactLayer('packages/react/src/lib/utils.ts')).toBe('lib')
    expect(classifyReactLayer('packages/react/src/components/button.ts')).toBe('components')
    expect(classifyReactLayer('packages/react/src/features/grid/NovaSheetGrid.ts')).toBe(
      'feature-grid',
    )
    expect(classifyReactLayer('packages/react/src/features/toolbar/index.ts')).toBe(
      'feature-toolbar',
    )
    expect(classifyReactLayer('packages/react/src/excel/NovaExcel.tsx')).toBe('excel')
    expect(classifyReactLayer('packages/react/src/index.ts')).toBe('index')
  })

  it('resolves @/ path alias relative to importer src root', () => {
    const resolved = resolveInternalImport(
      'packages/react/src/excel/NovaExcel.tsx',
      '@/features/grid',
    )
    expect(resolved?.replace(/\\/g, '/')).toEndWith('/src/features/grid')
  })

  it('reports cross-feature imports (R1)', () => {
    const files = new Map([
      [
        'packages/react/src/features/grid/Bad.ts',
        "import { NovaSheetToolbar } from '@/features/toolbar'\n",
      ],
    ])

    expect(findReactBoundaryViolations(files)).toEqual([
      {
        path: 'packages/react/src/features/grid/Bad.ts',
        line: 1,
        detail: "R1: cross-feature import '@/features/toolbar'",
      },
    ])
  })

  it('reports shared layer importing features (R3)', () => {
    const files = new Map([
      [
        'packages/react/src/components/bad.ts',
        "import { NovaSheetGrid } from '@/features/grid'\n",
      ],
    ])

    expect(findReactBoundaryViolations(files)).toEqual([
      {
        path: 'packages/react/src/components/bad.ts',
        line: 1,
        detail: "R3: shared layer imports '@/features/grid'",
      },
    ])
  })

  it('reports excel deep-import into features (R4)', () => {
    const files = new Map([
      [
        'packages/react/src/excel/Bad.tsx',
        "import { NovaSheetToolbar } from '@/features/toolbar/components/NovaSheetToolbar'\n",
      ],
    ])

    expect(findReactBoundaryViolations(files)).toEqual([
      {
        path: 'packages/react/src/excel/Bad.tsx',
        line: 1,
        detail:
          "R4: excel must import toolbar via feature index, not '@/features/toolbar/components/NovaSheetToolbar'",
      },
    ])
  })

  it('allows excel importing feature index (R4 pass)', () => {
    const files = new Map([
      [
        'packages/react/src/excel/Good.tsx',
        "import { NovaSheetGrid } from '@/features/grid'\nimport { NovaSheetToolbar } from '@/features/toolbar'\n",
      ],
    ])

    expect(findReactBoundaryViolations(files)).toEqual([])
  })
})
