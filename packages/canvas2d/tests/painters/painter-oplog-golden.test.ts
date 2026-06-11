import { describe, it } from 'bun:test'
import { ChunkedAxis, denseGridTheme, type Schema } from '@novasheet/core'
import { EmptyStatePainter } from '../../src/painters/EmptyStatePainter'
import { HeaderPainter } from '../../src/painters/HeaderPainter'
import { RowHeaderPainter } from '../../src/painters/RowHeaderPainter'
import { expectGolden } from '../helpers/golden'
import { dumpOps } from '../helpers/op-dump'
import { createRecordingContext } from '../helpers/recording-context'

/**
 * 单 painter op-log 黄金：隔离锁定整帧 op-log（Canvas2DRenderer.oplog-golden）不单独覆盖的
 * painter 变体——列头字段名 vs A/B 列标、整列/整行选中高亮、空状态插画。
 *
 * 更新：GOLDEN_UPDATE=1 bun test packages/canvas2d/tests/painters/painter-oplog-golden.test.ts
 */

const SCHEMA: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 120 },
    { id: 'age', name: 'Age', type: 'number', width: 80 },
  ],
}

describe('单 painter op-log 黄金', () => {
  it('HeaderPainter 字段名模式', () => {
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 2, defaultSize: 120 })
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis,
      colRange: [0, 1],
      width: 320,
    })
    expectGolden(import.meta.dir, 'painter-header-field-names', dumpOps(ops))
  })

  it('HeaderPainter A/B 列标 + 整列选中高亮', () => {
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 2, defaultSize: 120 })
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis,
      colRange: [0, 1],
      width: 320,
      columnLetters: true,
      selectedColumnRange: { startCol: 0, endCol: 0 },
    })
    expectGolden(import.meta.dir, 'painter-header-column-letters-selected', dumpOps(ops))
  })

  it('RowHeaderPainter 行号 + 整行选中高亮', () => {
    const { ctx, ops } = createRecordingContext()
    const rowsAxis = new ChunkedAxis({ count: 3, defaultSize: 28 })
    new RowHeaderPainter(denseGridTheme).paint(ctx, {
      rowsAxis,
      rowRange: [0, 2],
      rect: { x: 0, y: 32, width: 48, height: 84 },
      scrollOffsetY: 0,
      selectedRowRange: { startRow: 1, endRow: 1 },
    })
    expectGolden(import.meta.dir, 'painter-row-header-selected', dumpOps(ops))
  })

  it('EmptyStatePainter 空数据插画', () => {
    const { ctx, ops } = createRecordingContext()
    new EmptyStatePainter(denseGridTheme).paint(ctx, {
      rect: { x: 0, y: 32, width: 320, height: 128 },
    })
    expectGolden(import.meta.dir, 'painter-empty-state', dumpOps(ops))
  })
})
