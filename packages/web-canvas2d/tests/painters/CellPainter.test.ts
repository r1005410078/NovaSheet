import { describe, expect, it } from 'bun:test'
import type { Field } from '@novasheet/core'
import { CellPainter } from '../../src/painters/CellPainter'
import { denseGridTheme } from '@novasheet/core'
import { createRecordingContext } from '../helpers/recording-context'

function makeField(overrides: Partial<Field> = {}): Field {
  return { id: 'f1', name: 'F', type: 'text', width: 100, ...overrides }
}

describe('CellPainter — 单元格', () => {
  it('每格 save/clip/restore', () => {
    const { ctx, ops } = createRecordingContext()
    new CellPainter(denseGridTheme).paint(ctx, {
      value: 'hello',
      rect: { x: 0, y: 0, width: 100, height: 28 },
      field: makeField(),
    })
    const sequence = ops.map((o) => o.op).filter((op) => ['save', 'beginPath', 'rect', 'clip', 'restore'].includes(op))
    expect(sequence).toEqual(['save', 'beginPath', 'rect', 'clip', 'restore'])
  })

  it('文本左对齐并使用主题文字色', () => {
    const { ctx, ops } = createRecordingContext()
    new CellPainter(denseGridTheme).paint(ctx, {
      value: 'hello',
      rect: { x: 10, y: 0, width: 100, height: 28 },
      field: makeField({ type: 'text' }),
    })
    expect(ops).toContainEqual({ op: 'set:textAlign', value: 'left' })
    expect(ops).toContainEqual({ op: 'set:fillStyle', value: denseGridTheme.colors.text })
    const fillTextOp = ops.find((o) => o.op === 'fillText')
    expect(fillTextOp).toBeDefined()
    if (fillTextOp?.op === 'fillText') {
      expect(fillTextOp.args[0]).toBe('hello')
      // x = rect.x + padX = 10 + 8
      expect(fillTextOp.args[1]).toBe(18)
    }
  })

  it('数字右对齐并千分位', () => {
    const { ctx, ops } = createRecordingContext()
    new CellPainter(denseGridTheme).paint(ctx, {
      value: 1234567,
      rect: { x: 0, y: 0, width: 100, height: 28 },
      field: makeField({ type: 'number' }),
    })
    expect(ops).toContainEqual({ op: 'set:textAlign', value: 'right' })
    const fillTextOp = ops.find((o) => o.op === 'fillText')
    expect(fillTextOp).toBeDefined()
    if (fillTextOp?.op === 'fillText') {
      expect(fillTextOp.args[0]).toBe('1,234,567')
    }
  })

  it('长文本按可用宽度截断加省略号', () => {
    const { ctx, ops } = createRecordingContext()
    // RecordingContext.measureText returns length * 7 px
    // Field width 50, padX*2 = 16, available width = 34 → ~4 chars + …
    new CellPainter(denseGridTheme).paint(ctx, {
      value: 'abcdefghijklmnop',
      rect: { x: 0, y: 0, width: 50, height: 28 },
      field: makeField({ type: 'text', width: 50 }),
    })
    const fillTextOp = ops.find((o) => o.op === 'fillText')
    if (fillTextOp?.op === 'fillText') {
      expect(fillTextOp.args[0]).toMatch(/…$/)
      expect(fillTextOp.args[0].length).toBeLessThan('abcdefghijklmnop'.length)
    }
  })

  it('非 text/number 类型走 String() 回退', () => {
    const { ctx, ops } = createRecordingContext()
    new CellPainter(denseGridTheme).paint(ctx, {
      value: true,
      rect: { x: 0, y: 0, width: 100, height: 28 },
      field: makeField({ type: 'checkbox' }),
    })
    const fillTextOp = ops.find((o) => o.op === 'fillText')
    if (fillTextOp?.op === 'fillText') {
      expect(fillTextOp.args[0]).toBe('true')
    }
  })

  it('null/undefined 不绘制 fillText', () => {
    const { ctx, ops } = createRecordingContext()
    new CellPainter(denseGridTheme).paint(ctx, {
      value: null,
      rect: { x: 0, y: 0, width: 100, height: 28 },
      field: makeField({ type: 'text' }),
    })
    expect(ops.filter((o) => o.op === 'fillText')).toHaveLength(0)
  })

  it('Date 用 ISO 字符串', () => {
    const { ctx, ops } = createRecordingContext()
    const d = new Date('2026-05-13T00:00:00Z')
    new CellPainter(denseGridTheme).paint(ctx, {
      value: d,
      rect: { x: 0, y: 0, width: 200, height: 28 },
      field: makeField({ type: 'date' }),
    })
    const fillTextOp = ops.find((o) => o.op === 'fillText')
    if (fillTextOp?.op === 'fillText') {
      expect(fillTextOp.args[0]).toBe(d.toISOString())
    }
  })

  it('multiSelect 数组逗号拼接', () => {
    const { ctx, ops } = createRecordingContext()
    new CellPainter(denseGridTheme).paint(ctx, {
      value: ['a', 'b', 'c'],
      rect: { x: 0, y: 0, width: 200, height: 28 },
      field: makeField({ type: 'multiSelect' }),
    })
    const fillTextOp = ops.find((o) => o.op === 'fillText')
    if (fillTextOp?.op === 'fillText') {
      expect(fillTextOp.args[0]).toBe('a, b, c')
    }
  })
})
