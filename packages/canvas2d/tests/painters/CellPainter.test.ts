import { describe, expect, it } from 'bun:test'
import type { Field, TextMeasurer } from '@novasheet/core'
import { dateToSerial } from '@novasheet/core'
import { CellPainter } from '../../src/painters/CellPainter'
import { denseGridTheme } from '@novasheet/core'
import { createRecordingContext } from '../helpers/recording-context'

function makeField(overrides: Partial<Field> = {}): Field {
  return { id: 'f1', name: 'F', type: 'text', width: 100, ...overrides }
}

/** 固定宽度 measurer：每字符 7px，便于精确推算 wrap 结果。 */
const fixedWidthMeasurer: TextMeasurer = {
  measureWidth: (text) => text.length * 7,
}

describe('CellPainter — 单元格', () => {
  it('每格 save/clip/restore', () => {
    const { ctx, ops } = createRecordingContext()
    new CellPainter(denseGridTheme).paint(ctx, {
      value: 'hello',
      rect: { x: 0, y: 0, width: 100, height: 28 },
      field: makeField(),
    })
    const sequence = ops
      .map((o) => o.op)
      .filter((op) => ['save', 'beginPath', 'rect', 'clip', 'restore'].includes(op))
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
      // x = rect.x + width - padX = 0 + 100 - 8
      expect(fillTextOp.args[1]).toBe(92)
    }
  })

  it('textAlignByType=center 时正文锚点在单元格水平中心', () => {
    const theme = {
      ...denseGridTheme,
      cell: {
        ...denseGridTheme.cell,
        textAlignByType: {
          ...denseGridTheme.cell.textAlignByType,
          text: 'center' as const,
        },
      },
    }
    const { ctx, ops } = createRecordingContext()
    new CellPainter(theme).paint(ctx, {
      value: 'hello',
      rect: { x: 10, y: 0, width: 100, height: 28 },
      field: makeField({ type: 'text' }),
    })
    expect(ops).toContainEqual({ op: 'set:textAlign', value: 'center' })
    const fillTextOp = ops.find((o) => o.op === 'fillText')
    expect(fillTextOp).toBeDefined()
    if (fillTextOp?.op === 'fillText') {
      // x = rect.x + width/2 = 10 + 50
      expect(fillTextOp.args[1]).toBe(60)
    }
  })

  it('长文本默认（overflow）按可用宽度硬裁断、无省略号', () => {
    const { ctx, ops } = createRecordingContext()
    // measureText = len*7；宽 50、padX*2=16 → 可用 34 → 4 字符（28<=34<35）
    new CellPainter(denseGridTheme).paint(ctx, {
      value: 'abcdefghijklmnop',
      rect: { x: 0, y: 0, width: 50, height: 28 },
      field: makeField({ type: 'text', width: 50 }),
    })
    const fillTextOp = ops.find((o) => o.op === 'fillText')
    if (fillTextOp?.op === 'fillText') {
      expect((fillTextOp.args[0] as string).includes('…')).toBe(false)
      expect((fillTextOp.args[0] as string).length).toBeLessThan('abcdefghijklmnop'.length)
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

  it('custom 类型按文本左对齐 fallback', () => {
    const { ctx, ops } = createRecordingContext()
    new CellPainter(denseGridTheme).paint(ctx, {
      value: 'gold',
      rect: { x: 0, y: 0, width: 100, height: 28 },
      field: makeField({ type: 'rating' }),
    })
    expect(ops).toContainEqual({ op: 'set:textAlign', value: 'left' })
    const fillTextOp = ops.find((o) => o.op === 'fillText')
    if (fillTextOp?.op === 'fillText') {
      expect(fillTextOp.args[0]).toBe('gold')
    }
  })

  it('custom renderer wins over fallback text rendering', () => {
    const { ctx, ops } = createRecordingContext()
    const painter = new CellPainter(denseGridTheme, {
      cellRenderers: {
        rating: {
          paint: (paintCtx, params) => {
            paintCtx.fillText(`rating:${String(params.value)}`, params.rect.x, params.rect.y)
          },
        },
      },
    })

    painter.paint(ctx, {
      value: 4,
      rect: { x: 10, y: 20, width: 100, height: 28 },
      field: makeField({ type: 'rating' }),
    })

    const fillTextOps = ops.filter((op) => op.op === 'fillText')
    expect(fillTextOps).toEqual([{ op: 'fillText', args: ['rating:4', 10, 20] }])
    expect(fillTextOps).not.toContainEqual({ op: 'fillText', args: ['4', 18, 34] })
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

  it('date 字段：serial 数渲染为字符串数字（无 valueFormat 时 fallback）', () => {
    const { ctx, ops } = createRecordingContext()
    // serial date：2026-05-13T00:00:00Z
    const serial = dateToSerial(new Date('2026-05-13T00:00:00Z'))
    new CellPainter(denseGridTheme).paint(ctx, {
      value: serial,
      rect: { x: 0, y: 0, width: 200, height: 28 },
      field: makeField({ type: 'date' }),
    })
    const fillTextOp = ops.find((o) => o.op === 'fillText')
    if (fillTextOp?.op === 'fillText') {
      expect(fillTextOp.args[0]).toBe(String(serial))
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

  describe('M3 wrap 模式', () => {
    it('wrap=true + 高度够时多行绘制', () => {
      // 单元格宽 100，padX=8 → maxWidth=84；fixedWidth measurer 7px/char → 12 char/行
      // 'hello world foo bar baz qux' tokens: 'hello '(6×7=42) 'world '(42) 'foo '(28) 'bar '(28) 'baz '(28) 'qux'(21)
      // 行 1：'hello '(42) + 'world '(42) = 84 OK；+ 'foo '(28) = 112 超 → flush 'hello world'
      // 行 2：'foo '(28) + 'bar '(28) + 'baz '(28) = 84 OK；+ 'qux'(21) 超 → flush 'foo bar baz'
      // 行 3：'qux'
      const { ctx, ops } = createRecordingContext()
      new CellPainter(denseGridTheme, { measurer: fixedWidthMeasurer }).paint(ctx, {
        value: 'hello world foo bar baz qux',
        rect: { x: 0, y: 0, width: 100, height: 100 },
        field: makeField({ type: 'text', wrap: true }),
      })
      const lines = ops
        .filter(
          (o): o is { op: 'fillText'; args: [string, number, number, number?] } =>
            o.op === 'fillText',
        )
        .map((o) => o.args[0])
      expect(lines.length).toBeGreaterThanOrEqual(2)
      expect(lines.join('')).toContain('hello')
      expect(lines.join('')).toContain('qux')
    })

    it('wrap=true 但 measurer 缺席时退化为单行硬裁断（无省略号）', () => {
      const { ctx, ops } = createRecordingContext()
      // 不传 measurer：wrap 无法软折，退化为单行 paintLines（硬裁断）
      new CellPainter(denseGridTheme).paint(ctx, {
        value: 'hello world foo bar baz qux',
        rect: { x: 0, y: 0, width: 50, height: 28 },
        field: makeField({ type: 'text', width: 50, wrap: true }),
      })
      const fillTexts = ops.filter((o) => o.op === 'fillText')
      expect(fillTexts.length).toBe(1) // 单行
      const txt = fillTexts[0]
      if (txt?.op === 'fillText') {
        expect((txt.args[0] as string).includes('…')).toBe(false)
      }
    })

    it('wrap=true 且高度不够时末行 `…` 截断', () => {
      // 高度 = padY*2 + lineHeight*N。fontSize=12，lineHeight=12×1.4=16.8
      // 单元格高 50，padY=4 → 可用 42 → maxLines = floor(42/16.8) = 2
      const { ctx, ops } = createRecordingContext()
      new CellPainter(denseGridTheme, { measurer: fixedWidthMeasurer }).paint(ctx, {
        value: '一二三四五六七八九十十一十二',
        rect: { x: 0, y: 0, width: 50, height: 50 },
        field: makeField({ type: 'text', wrap: true }),
      })
      const lines = ops
        .filter(
          (o): o is { op: 'fillText'; args: [string, number, number, number?] } =>
            o.op === 'fillText',
        )
        .map((o) => o.args[0])
      expect(lines.length).toBeLessThanOrEqual(2)
      expect(lines[lines.length - 1]!.endsWith('…')).toBe(true)
    })

    it('wrap=true 值里的 \\n 强制分行（Alt+Enter 提交后渲染）', () => {
      const { ctx, ops } = createRecordingContext()
      new CellPainter(denseGridTheme, { measurer: fixedWidthMeasurer }).paint(ctx, {
        value: 'first\nsecond',
        rect: { x: 0, y: 0, width: 200, height: 100 },
        field: makeField({ type: 'text', wrap: true }),
      })
      const lines = ops
        .filter(
          (o): o is { op: 'fillText'; args: [string, number, number, number?] } =>
            o.op === 'fillText',
        )
        .map((o) => o.args[0])
      expect(lines).toEqual(['first', 'second'])
    })

    it('number 字段即使 wrap=true 仍单行右对齐', () => {
      const { ctx, ops } = createRecordingContext()
      new CellPainter(denseGridTheme, { measurer: fixedWidthMeasurer }).paint(ctx, {
        value: 1234567,
        rect: { x: 0, y: 0, width: 100, height: 100 },
        field: makeField({ type: 'number', wrap: true }),
      })
      const fillTexts = ops.filter((o) => o.op === 'fillText')
      expect(fillTexts.length).toBe(1)
      if (fillTexts[0]?.op === 'fillText') {
        expect(fillTexts[0].args[0]).toBe('1,234,567')
      }
    })
  })

  describe('硬换行（Alt+Enter \\n，不依赖 wrap）', () => {
    it('非 wrap 文本格按 \\n 逐行绘制', () => {
      const { ctx, ops } = createRecordingContext()
      new CellPainter(denseGridTheme).paint(ctx, {
        value: 'ab\ncd',
        rect: { x: 0, y: 0, width: 100, height: 56 },
        field: makeField({ type: 'text' }),
      })
      const texts = ops.filter((o) => o.op === 'fillText').map((o) => o.args[0])
      expect(texts).toEqual(['ab', 'cd'])
    })

    it('无 measurer 也能硬换行（按行截断，不软折）', () => {
      const { ctx, ops } = createRecordingContext()
      new CellPainter(denseGridTheme).paint(ctx, {
        value: 'line1\nline2\nline3',
        rect: { x: 0, y: 0, width: 100, height: 100 },
        field: makeField({ type: 'text' }),
      })
      const ys = ops.filter((o) => o.op === 'fillText').map((o) => o.args[2])
      expect(ys.length).toBe(3)
      expect(ys[1]).toBeGreaterThan(ys[0] as number) // 逐行向下堆叠
      expect(ys[2]).toBeGreaterThan(ys[1] as number)
    })
  })

  describe('textWrap 三态', () => {
    const long = 'abcdefghijklmnopqrstuvwxyz'

    it('clip：硬裁断、无省略号', () => {
      const { ctx, ops } = createRecordingContext()
      new CellPainter(denseGridTheme).paint(ctx, {
        value: long,
        rect: { x: 0, y: 0, width: 100, height: 28 },
        field: makeField({ type: 'text' }),
        textWrap: 'clip',
      })
      const txt = ops.find((o) => o.op === 'fillText')
      expect(txt?.op === 'fillText' && txt.args[0]).toBe('abcdefghijkl') // 84/7=12 字符
      expect(txt?.op === 'fillText' && (txt.args[0] as string).includes('…')).toBe(false)
    })

    it('overflow（默认）：同样无省略号（溢出留给 renderer）', () => {
      const { ctx, ops } = createRecordingContext()
      new CellPainter(denseGridTheme).paint(ctx, {
        value: long,
        rect: { x: 0, y: 0, width: 100, height: 28 },
        field: makeField({ type: 'text' }),
      })
      const txt = ops.find((o) => o.op === 'fillText')
      expect(txt?.op === 'fillText' && (txt.args[0] as string).includes('…')).toBe(false)
    })

    it('textWrap=wrap 即使 field.wrap 未设也走折行', () => {
      const { ctx, ops } = createRecordingContext()
      new CellPainter(denseGridTheme, { measurer: fixedWidthMeasurer }).paint(ctx, {
        value: long,
        rect: { x: 0, y: 0, width: 100, height: 100 },
        field: makeField({ type: 'text' }), // 无 field.wrap
        textWrap: 'wrap',
      })
      expect(ops.filter((o) => o.op === 'fillText').length).toBeGreaterThan(1)
    })
  })
})

describe('CellPainter formatCell（Phase 5-C）', () => {
  const field: Field = { id: 'a', name: 'A', type: 'number', width: 100 }
  const rect = { x: 0, y: 0, width: 100, height: 24 }

  it('formatCell 命中时画格式化文本', () => {
    const { ctx, ops } = createRecordingContext()
    new CellPainter(denseGridTheme).paint(ctx, {
      value: 1234.5,
      rect,
      field,
      rowIndex: 0,
      colIndex: 0,
      formatCell: () => '¥1,234.50',
    })
    const texts = ops.filter((o) => o.op === 'fillText').map((o) => (o as { op: 'fillText'; args: [string, number, number, number?] }).args[0])
    expect(texts).toContain('¥1,234.50')
  })

  it('formatCell 返回 undefined 时退回默认（number 千分位）', () => {
    const { ctx, ops } = createRecordingContext()
    new CellPainter(denseGridTheme).paint(ctx, {
      value: 1234,
      rect,
      field,
      rowIndex: 0,
      colIndex: 0,
      formatCell: () => undefined,
    })
    const texts = ops.filter((o) => o.op === 'fillText').map((o) => (o as { op: 'fillText'; args: [string, number, number, number?] }).args[0])
    expect(texts).toContain('1,234')
  })
})
