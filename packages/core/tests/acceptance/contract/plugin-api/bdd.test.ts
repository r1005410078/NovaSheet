import { describe, expect, it } from 'bun:test'

import * as publicApi from '../../../../src'
import {
  type CellFormat,
  type FilterSpec,
  type GridOptions,
  type UndoCommand,
} from '../../../../src'
import {
  createDenseData,
  createNoopBackend,
} from '../../_helpers/fixtures'
import { expectGolden } from '../../_helpers/golden'

describe('Core acceptance type inventory', () => {
  it('core.type.public-api-inventory keeps representative public types importable', () => {
    type Inventory = {
      gridOptions: GridOptions
      undo: UndoCommand
      format: CellFormat
      filter: FilterSpec
    }
    const sample: Inventory = {
      gridOptions: { data: createDenseData(), backend: createNoopBackend },
      undo: { kind: 'editCell', rowIndex: 0, fieldId: 'a', before: null, after: 'x' },
      format: { fillColor: '#ffffff' },
      filter: { fieldId: 'name', op: { kind: 'is-empty' } },
    }
    expect(sample.gridOptions.data.getRowCount()).toBe(2)
    expect(sample.undo.kind).toBe('editCell')
    expect(sample.format.fillColor).toBe('#ffffff')
    expect(sample.filter.op.kind).toBe('is-empty')

    // 运行时导出面入金：index.ts 增删任何 value 导出都必须显式过 review。
    // type-only 导出不在 Object.keys 内，仍由上面的类型引用 + strict typecheck 覆盖。
    const exportNames = Object.keys(publicApi).sort().join('\n')
    expectGolden(import.meta.dir, 'core.type.public-api-inventory', `${exportNames}\n`)
  })
})
