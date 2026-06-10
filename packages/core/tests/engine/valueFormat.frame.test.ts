import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import { InMemoryDataSource } from '../../src/kernel/data/InMemoryDataSource'
import type { CellFormatter, ValueFormat } from '../../src/kernel/protocol/FormatTypes'
import type { Field } from '../../src/kernel/data/Schema'

/**
 * Phase 5-C 值格式化端到端：覆盖 `setValueFormat`/列默认 → `getFrame().formatCell` 全链，
 * 补此前只有分段单测、无端到端测的缺口。同时锁定"空格无可格式化值时 formatCell 返回
 * undefined（painter 回退/不绘制）"这一行为——它解释了在空 SparseExcelDataSource 上套
 * 格式"看似没反应"实为预期。
 */
function makeEngine(options?: {
  columnFormat?: ValueFormat
  formatters?: Record<string, CellFormatter>
}) {
  const field: Field = {
    id: 'amt',
    name: 'Amt',
    type: 'number',
    width: 100,
    ...(options?.columnFormat ? { format: options.columnFormat } : {}),
  }
  const data = new InMemoryDataSource({ schema: { fields: [field] }, rows: [{ amt: 1234.5 }] })
  const engine = new DefaultGridEngine({ data, formatters: options?.formatters })
  engine.setViewportSize(400, 400)
  return { engine, field }
}

describe('Phase 5-C value formatting — getFrame().formatCell 端到端', () => {
  it('列级 Field.format 对数字格输出格式化文本', () => {
    const { engine, field } = makeEngine({ columnFormat: { kind: 'currency', currency: 'CNY' } })
    const frame = engine.getFrame()
    // en-US 默认 locale 下 CNY 渲染为 CN¥（消歧）；zh-CN 才是 ¥。
    expect(frame.formatCell?.(0, 0, field, 1234.5)).toBe('CN¥1,234.50')
  })

  it('cell 级 setValueFormat（toolbar 路径）写入并经 formatCell 格式化', () => {
    const { engine, field } = makeEngine()
    const ok = engine.setValueFormat(
      { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
      { kind: 'percent', decimals: 1 },
    )
    expect(ok).toBe(true)
    const frame = engine.getFrame()
    expect(frame.cellFormats?.length).toBe(1)
    expect(frame.formatCell?.(0, 0, field, 0.1357)).toBe('13.6%')
  })

  it('自定义 formatter 经 GridEngineOptions.formatters 注册并生效', () => {
    const { engine, field } = makeEngine({
      columnFormat: { kind: 'custom', formatterId: 'kb' },
      formatters: { kb: (v) => `${v as number} KB` },
    })
    const frame = engine.getFrame()
    expect(frame.formatCell?.(0, 0, field, 12)).toBe('12 KB')
  })

  it('空值（null/undefined）→ formatCell 返回 undefined（解释空格"没反应"）', () => {
    const { engine, field } = makeEngine({ columnFormat: { kind: 'currency', currency: 'CNY' } })
    const frame = engine.getFrame()
    expect(frame.formatCell?.(0, 0, field, null)).toBeUndefined()
    expect(frame.formatCell?.(0, 0, field, undefined as never)).toBeUndefined()
  })

  it('非数字值套数字格式 → undefined（painter 回退默认显示，不污染）', () => {
    const { engine, field } = makeEngine({ columnFormat: { kind: 'number', thousands: true } })
    const frame = engine.getFrame()
    expect(frame.formatCell?.(0, 0, field, 'hello' as never)).toBeUndefined()
  })

  it('文本字段 + 字符串数字（out-of-the-box 复现）→ setValueFormat 后格式化', () => {
    // SparseExcelDataSource 字段是 type:'text'，输入的数字存为字符串 "1234.5"。
    const data = new InMemoryDataSource({
      schema: { fields: [{ id: 'amt', name: 'Amt', type: 'text', width: 100 }] },
      rows: [{ amt: '1234.5' }],
    })
    const engine = new DefaultGridEngine({ data })
    engine.setViewportSize(400, 400)
    const field = data.getSchema().fields[0]!
    expect(
      engine.setValueFormat(
        { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
        { kind: 'currency', currency: 'CNY' },
      ),
    ).toBe(true)
    expect(engine.getFrame().formatCell?.(0, 0, field, '1234.5')).toBe('CN¥1,234.50')
  })
})
