import { describe, expect, it } from 'bun:test'
import type { CellTypeRegistry, Field } from '../../../src'
import {
  SKIP_CELL_VALUE,
  formatCellForEditWithTypes,
  getCellTypeDefinition,
  parseCellEditInputWithTypes,
} from '../../../src/features/cell-types'

const ratingField: Field = {
  id: 'score',
  name: 'Score',
  type: 'rating',
  width: 120,
  options: { max: 5 },
}

describe('core.L0.cell-extension-type-definition-contract', () => {
  it('custom cell type drives edit parse and sort semantics', () => {
    const cellTypes: CellTypeRegistry = {
      rating: {
        formatForEdit: (value) => String(value ?? ''),
        parseEditInput: (input, ctx) => {
          const n = Number(input)
          if (Number.isNaN(n)) return SKIP_CELL_VALUE
          const max = Number(ctx.field.options?.max ?? 5)
          return Math.max(0, Math.min(max, n))
        },
        sortValue: (value) => (typeof value === 'number' ? value : null),
        filterOperators: [
          {
            id: 'gte',
            label: '>=',
            matches: (value, operand) =>
              typeof value === 'number' && typeof operand === 'number' && value >= operand,
          },
        ],
      },
    }

    const definition = getCellTypeDefinition('rating', cellTypes)
    expect(definition).toBe(cellTypes.rating)
    expect(formatCellForEditWithTypes(4, ratingField, cellTypes)).toBe('4')
    expect(parseCellEditInputWithTypes('9', ratingField, cellTypes)).toBe(5)
    expect(parseCellEditInputWithTypes('bad', ratingField, cellTypes)).toBe(SKIP_CELL_VALUE)
    expect(definition?.sortValue?.(4, { field: ratingField, locale: 'en-US' })).toBe(4)
    expect(definition?.filterOperators?.[0]?.matches(4, 3, { field: ratingField, locale: 'en-US' })).toBe(
      true,
    )
  })
})

describe('core.L0.cell-extension-custom-type-fallback', () => {
  it('unregistered custom type falls back to text display and is not editable', () => {
    expect(getCellTypeDefinition('rating', {})).toBeUndefined()
    expect(formatCellForEditWithTypes(4, ratingField, {})).toBe('4')
    expect(parseCellEditInputWithTypes('5', ratingField, {})).toBe(SKIP_CELL_VALUE)
  })
})
