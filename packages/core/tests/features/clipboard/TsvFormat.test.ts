import { describe, expect, it } from 'bun:test'
import { serializeRowsToTsv, parseTsvToCells } from '../../../src/features/clipboard/TsvFormat'
import type { Schema } from '../../../src/kernel/data/Schema'
import { dateToSerial } from '../../../src/kernel/protocol/serial'

const schema: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 100 },
    { id: 'qty', name: 'Qty', type: 'number', width: 100 },
    { id: 'done', name: 'Done', type: 'checkbox', width: 80 },
  ],
}

describe('serializeRowsToTsv', () => {
  it('text / number / boolean / null 按规则序列化', () => {
    const rows = [
      { name: 'apple', qty: 3, done: true },
      { name: 'banana', qty: null, done: false },
    ]
    expect(serializeRowsToTsv(rows, ['name', 'qty', 'done'], schema)).toBe(
      'apple\t3\ttrue\nbanana\t\tfalse',
    )
  })

  it('undefined / NaN / Infinity → 空串', () => {
    // Note: Row doesn't support undefined in its type, but the function handles missing fields
    // (which coerce to undefined when accessed). Test with missing field instead.
    const rows = [{ qty: NaN } as unknown as Record<string, string | number | boolean | null>]
    expect(serializeRowsToTsv(rows, ['name', 'qty', 'done'], schema)).toBe('\t\t')
  })

  it('数组（multiSelect）→ 逗号连接', () => {
    const tagsSchema: Schema = {
      fields: [{ id: 'tags', name: 'Tags', type: 'multiSelect', width: 100 }],
    }
    expect(serializeRowsToTsv([{ tags: ['a', 'b'] }], ['tags'], tagsSchema)).toBe('a,b')
  })

  it('空 rows → 空字符串', () => {
    expect(serializeRowsToTsv([], ['name'], schema)).toBe('')
  })

  it('date 列序列化为 ISO（凭 schema 类型）', () => {
    const dateSchema: Schema = { fields: [{ id: 'd', name: 'D', type: 'date', width: 100 }] }
    const serial = dateToSerial(new Date(Date.UTC(2025, 0, 15)))
    expect(serializeRowsToTsv([{ d: serial }], ['d'], dateSchema)).toBe('2025-01-15T00:00:00.000Z')
  })

  it('number 列不转（序列化为数字串）', () => {
    const numSchema: Schema = { fields: [{ id: 'n', name: 'N', type: 'number', width: 100 }] }
    expect(serializeRowsToTsv([{ n: 45000 }], ['n'], numSchema)).toBe('45000')
  })
})

describe('parseTsvToCells', () => {
  it('两行 × 三列', () => {
    const out = parseTsvToCells('apple\t3\ttrue\nbanana\t\tfalse', ['name', 'qty', 'done'], schema)
    expect(out).toEqual([
      ['apple', 3, true],
      ['banana', null, false],
    ])
  })

  it('number 列：无法 coerce 时保留 raw string（让 applyPaste 决定 SKIP）', () => {
    const out = parseTsvToCells('abc\nhello', ['qty'], schema)
    expect(out).toEqual([['abc'], ['hello']])
  })

  it('text 列：空串保留为空串（不是 null）', () => {
    const out = parseTsvToCells('\nhello', ['name'], schema)
    expect(out).toEqual([[''], ['hello']])
  })

  it('checkbox：true/1/yes → true；false/0/no/空 → false；其它保留 raw string（让 applyPaste 决定 SKIP）', () => {
    const out = parseTsvToCells('true\n1\nyes\nfalse\n0\nno\nmaybe', ['done'], schema)
    expect(out).toEqual([[true], [true], [true], [false], [false], [false], ['maybe']])
  })

  it('行长不齐：短行右侧补 null', () => {
    const out = parseTsvToCells('a\tb\nc', ['name', 'qty'], schema)
    expect(out[1]).toEqual(['c', null])
  })

  it('trim 末尾换行', () => {
    expect(parseTsvToCells('a\n', ['name'], schema)).toEqual([['a']])
  })

  it('未知列 id（解析时 schema 没找到）→ raw string', () => {
    const out = parseTsvToCells('x\ny', ['nope'], schema)
    expect(out).toEqual([['x'], ['y']])
  })
})

describe('TSV 多行单元格转义（RFC-4180 引号）', () => {
  it('含 \\n 的格序列化时加引号、内部 " 翻倍', () => {
    const rows = [{ name: 'line1\nline2', qty: 1, done: false }]
    const tsv = serializeRowsToTsv(rows, ['name', 'qty', 'done'], schema)
    expect(tsv).toBe('"line1\nline2"\t1\tfalse')
    const nameSchema: Schema = { fields: [{ id: 'name', name: 'Name', type: 'text', width: 100 }] }
    const withQuote = serializeRowsToTsv([{ name: 'a"b\nc' }], ['name'], nameSchema)
    expect(withQuote).toBe('"a""b\nc"')
  })

  it('round-trip：含 \\n 的格不被拆成多行', () => {
    const rows = [
      { name: 'a\nb', qty: 1, done: false },
      { name: 'plain', qty: 2, done: true },
    ]
    const tsv = serializeRowsToTsv(rows, ['name', 'qty', 'done'], schema)
    const parsed = parseTsvToCells(tsv, ['name', 'qty', 'done'], schema)
    expect(parsed.length).toBe(2) // 两行，不因 cell 内 \n 散成 3 行
    expect(parsed[0]![0]).toBe('a\nb')
    expect(parsed[1]![0]).toBe('plain')
  })

  it('解析引号内的 \\t 不当作列分隔', () => {
    const parsed = parseTsvToCells('"a\tb"\tplain', ['name', 'done'], schema)
    expect(parsed[0]![0]).toBe('a\tb')
  })
})
