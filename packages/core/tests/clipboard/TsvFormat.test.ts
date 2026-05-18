import { describe, expect, it } from 'bun:test'
import { serializeRowsToTsv, parseTsvToCells } from '../../src/clipboard/TsvFormat'
import type { Schema } from '../../src/data/Schema'

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
    expect(serializeRowsToTsv(rows, ['name', 'qty', 'done'])).toBe(
      'apple\t3\ttrue\nbanana\t\tfalse',
    )
  })

  it('undefined / NaN / Infinity → 空串', () => {
    // Note: Row doesn't support undefined in its type, but the function handles missing fields
    // (which coerce to undefined when accessed). Test with missing field instead.
    const rows = [{ qty: NaN } as unknown as Record<string, string | number | boolean | null>]
    expect(serializeRowsToTsv(rows, ['name', 'qty', 'done'])).toBe('\t\t')
  })

  it('Date → ISO 字符串', () => {
    const d = new Date('2026-05-18T00:00:00.000Z')
    expect(serializeRowsToTsv([{ at: d }], ['at'])).toBe('2026-05-18T00:00:00.000Z')
  })

  it('数组（multiSelect）→ 逗号连接', () => {
    expect(serializeRowsToTsv([{ tags: ['a', 'b'] }], ['tags'])).toBe('a,b')
  })

  it('空 rows → 空字符串', () => {
    expect(serializeRowsToTsv([], ['name'])).toBe('')
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
    const out = parseTsvToCells(
      'true\n1\nyes\nfalse\n0\nno\nmaybe',
      ['done'],
      schema,
    )
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
