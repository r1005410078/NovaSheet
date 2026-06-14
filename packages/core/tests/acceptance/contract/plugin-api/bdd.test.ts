import { describe, expect, it } from 'bun:test'

import * as publicApi from '../../../../src'
import {
  DefaultGridEngine,
  InMemoryDataSource,
  type CellActionContext,
  type CellAttachmentCodec,
  type CellFilterOperator,
  type CellFormat,
  type CellTypeDefinition,
  type CellTypeRegistry,
  type FilterSpec,
  type GridOptions,
  type Row,
  type Schema,
  type UndoCommand,
} from '../../../../src'
import {
  createDenseData,
  createMutableData,
  createNoopBackend,
  mountRecordingGrid,
  withManualRaf,
} from '../../_helpers/fixtures'
import { expectGolden } from '../../_helpers/golden'

describe('Core acceptance type inventory', () => {
  it('core.type.public-api-inventory keeps representative public types importable', () => {
    type Inventory = {
      gridOptions: GridOptions
      undo: UndoCommand
      format: CellFormat
      filter: FilterSpec
      cellType: CellTypeDefinition
      cellTypes: CellTypeRegistry
      cellFilterOperator: CellFilterOperator
      cellAction: CellActionContext | undefined
    }
    const sample: Inventory = {
      gridOptions: { data: createDenseData(), backend: createNoopBackend },
      undo: { kind: 'editCell', rowIndex: 0, fieldId: 'a', before: null, after: 'x' },
      format: { fillColor: '#ffffff' },
      filter: { fieldId: 'name', op: { kind: 'is-empty' } },
      cellType: { parseEditInput: (input) => input },
      cellTypes: {},
      cellFilterOperator: { id: 'is', label: 'is', matches: (value, operand) => value === operand },
      cellAction: undefined,
    }
    expect(sample.gridOptions.data.getRowCount()).toBe(2)
    expect(sample.undo.kind).toBe('editCell')
    expect(sample.format.fillColor).toBe('#ffffff')
    expect(sample.filter.op.kind).toBe('is-empty')
    expect(sample.cellType.parseEditInput?.('x', { field: { id: 'a', name: 'A', type: 'text', width: 80 }, locale: 'en-US' })).toBe('x')
    expect(sample.cellTypes).toEqual({})
    expect(sample.cellFilterOperator.matches('a', 'a', { field: { id: 'a', name: 'A', type: 'text', width: 80 }, locale: 'en-US' })).toBe(true)
    expect(sample.cellAction).toBeUndefined()

    // 运行时导出面入金：index.ts 增删任何 value 导出都必须显式过 review。
    // type-only 导出不在 Object.keys 内，仍由上面的类型引用 + strict typecheck 覆盖。
    const exportNames = Object.keys(publicApi).sort().join('\n')
    expectGolden(import.meta.dir, 'core.type.public-api-inventory', `${exportNames}\n`)
  })
})

describe('Core acceptance cell-attachment', () => {
  it('core.L2.cell-attachment-store-set-get-undo round-trips and undoes', () => {
    withManualRaf((_flushRaf) => {
      const demoCodec: CellAttachmentCodec<{ note: string }> = {
        namespace: 'demo',
        serialize: (d) => JSON.stringify(d),
        deserialize: (t) => JSON.parse(t) as { note: string },
      }
      const { grid } = mountRecordingGrid({
        data: createDenseData(),
        cellAttachments: [demoCodec],
      })
      grid.setCellAttachment('demo', 1, 0, { note: 'x' })
      expect(grid.getCellAttachment('demo', 1, 0)).toEqual({ note: 'x' })
      grid.undo()
      expect(grid.getCellAttachment('demo', 1, 0)).toBeUndefined()
      grid.redo()
      expect(grid.getCellAttachment('demo', 1, 0)).toEqual({ note: 'x' })
      grid.destroy()
    })
  })

  it('core.L1.cell-attachment-fill-propagate propagates attachment on fill and restores on undo', () => {
    const fillSchema: Schema = {
      fields: [
        { id: 'a', name: 'A', type: 'text', width: 80 },
      ],
    }
    const demoCodec: CellAttachmentCodec<{ v: number }> = {
      namespace: 'demo',
      serialize: (d) => JSON.stringify(d),
      deserialize: (t) => JSON.parse(t) as { v: number },
    }
    const engine = new DefaultGridEngine({
      data: new InMemoryDataSource({
        schema: fillSchema,
        rows: [
          { a: 'src' },
          { a: null },
          { a: null },
        ] satisfies Row[],
      }),
      cellAttachments: [demoCodec],
    })
    // 源格设附件
    engine.setCellAttachment('demo', 0, 0, { v: 1 })
    // 向下 fill 到 row 1 和 row 2
    engine.commitFill(
      { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
      { startRow: 1, endRow: 2, startCol: 0, endCol: 0 },
      'down',
    )
    // 目标格附件已平铺
    expect(engine.getCellAttachment('demo', 1, 0)).toEqual({ v: 1 })
    expect(engine.getCellAttachment('demo', 2, 0)).toEqual({ v: 1 })
    // undo 后目标格附件消失，源格保留
    engine.undo()
    expect(engine.getCellAttachment('demo', 1, 0)).toBeUndefined()
    expect(engine.getCellAttachment('demo', 2, 0)).toBeUndefined()
    expect(engine.getCellAttachment('demo', 0, 0)).toEqual({ v: 1 })
    // redo 后目标格附件恢复
    engine.redo()
    expect(engine.getCellAttachment('demo', 1, 0)).toEqual({ v: 1 })
    expect(engine.getCellAttachment('demo', 2, 0)).toEqual({ v: 1 })
  })

  it('core.L1.cell-attachment-follows-row-insert shifts with raw cell', () => {
    withManualRaf((_flushRaf) => {
      const demoCodec: CellAttachmentCodec<{ note: string }> = {
        namespace: 'demo',
        serialize: (d) => JSON.stringify(d),
        deserialize: (t) => JSON.parse(t) as { note: string },
      }
      const { grid } = mountRecordingGrid({
        data: createMutableData(),
        cellAttachments: [demoCodec],
      })
      grid.setCellAttachment('demo', 2, 0, { note: 'y' })
      grid.insertRows(0, 1)
      expect(grid.getCellAttachment('demo', 3, 0)).toEqual({ note: 'y' })
      expect(grid.getCellAttachment('demo', 2, 0)).toBeUndefined()
      grid.destroy()
    })
  })
})
