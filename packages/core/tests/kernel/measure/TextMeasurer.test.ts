import { describe, expect, it } from 'bun:test'
import { tokenize, wrapText, type TextMeasurer } from '../../../src/kernel/measure/TextMeasurer'

/** 测试用 measurer——每字符宽度固定 7px。`text.length × 7`。 */
const fixedWidth: TextMeasurer = {
  measureWidth: (text) => text.length * 7,
}

describe('tokenize', () => {
  it('空字符串返回空数组', () => {
    expect(tokenize('')).toEqual([])
  })

  it('英文按空格切，空格附在词尾', () => {
    expect(tokenize('hello world')).toEqual(['hello ', 'world'])
  })

  it('多个连续空格保留', () => {
    expect(tokenize('a  b')).toEqual(['a  ', 'b'])
  })

  it('CJK 每字符各成 token', () => {
    expect(tokenize('中文')).toEqual(['中', '文'])
  })

  it('英文与 CJK 混合：英文成词、CJK 拆字', () => {
    expect(tokenize('hello 中文 world')).toEqual(['hello ', '中', '文', ' ', 'world'])
  })

  it('硬换行符独立成 token', () => {
    expect(tokenize('a\nb')).toEqual(['a', '\n', 'b'])
  })

  it('Hangul / Hiragana / Katakana 也按字符切', () => {
    expect(tokenize('안녕 こんにちは')).toEqual(['안', '녕', ' ', 'こ', 'ん', 'に', 'ち', 'は'])
  })

  it('全角标点（CJK Symbols and Punctuation）按字符切', () => {
    expect(tokenize('文，本')).toEqual(['文', '，', '本'])
  })
})

describe('wrapText', () => {
  it('空文本：lines 空、height 0', () => {
    const result = wrapText('', { font: '12px x', maxWidth: 100, lineHeight: 18 }, fixedWidth)
    expect(result.lines).toEqual([])
    expect(result.height).toBe(0)
  })

  it('文本宽度小于 maxWidth：单行', () => {
    const result = wrapText('hello', { font: '12px x', maxWidth: 100, lineHeight: 18 }, fixedWidth)
    expect(result.lines).toEqual(['hello'])
    expect(result.height).toBe(18)
  })

  it('英文按词换行（贪心：能塞下就塞）', () => {
    // tokens: ['hello ', 'world ', 'foo'] = 42 + 42 + 21
    // maxWidth=70：'hello '(42) 装得下；+ 'world '(42)=84 装不下 → 第一行 'hello'
    // 第二行：'world '(42) + 'foo'(21)=63 ≤ 70 → 'world foo'
    const result = wrapText(
      'hello world foo',
      { font: '12px x', maxWidth: 70, lineHeight: 18 },
      fixedWidth,
    )
    expect(result.lines).toEqual(['hello', 'world foo'])
    expect(result.height).toBe(36)
  })

  it('严格不能合并 token 时强制换行', () => {
    // maxWidth=42 只够一个 'hello ' / 'world ' / 'foo'
    const result = wrapText(
      'hello world foo',
      { font: '12px x', maxWidth: 42, lineHeight: 18 },
      fixedWidth,
    )
    expect(result.lines).toEqual(['hello', 'world', 'foo'])
    expect(result.height).toBe(54)
  })

  it('CJK 按字符换行', () => {
    // 5 CJK chars × 7 = 35px each line, maxWidth=21 → 3 chars per line
    const result = wrapText(
      '中文测试啦',
      { font: '12px x', maxWidth: 21, lineHeight: 18 },
      fixedWidth,
    )
    // 实际：'中'(7) + '文'(7) + '测'(7) = 21 ≤ 21 ✓；'试'(7) 加上变 28 > 21，换行
    expect(result.lines).toEqual(['中文测', '试啦'])
    expect(result.height).toBe(36)
  })

  it('硬换行符强制分行', () => {
    const result = wrapText('a\nb', { font: '12px x', maxWidth: 100, lineHeight: 18 }, fixedWidth)
    expect(result.lines).toEqual(['a', 'b'])
  })

  it('单个超长 token：字符级硬切', () => {
    // 'supercalifragilistic' 20 chars × 7 = 140px, maxWidth=21 → 每行 3 字符
    const result = wrapText(
      'supercalifragilistic',
      { font: '12px x', maxWidth: 21, lineHeight: 18 },
      fixedWidth,
    )
    expect(result.lines.length).toBe(Math.ceil(20 / 3))
    expect(result.lines.every((line) => line.length <= 3)).toBe(true)
    expect(result.lines.join('')).toBe('supercalifragilistic')
  })

  it('maxLines 命中时末行追加 `…`', () => {
    // 5 行内容，maxLines=2 → 2 行，末行带 …
    const result = wrapText(
      '一二三四五六七八九十',
      { font: '12px x', maxWidth: 14, lineHeight: 18, maxLines: 2 },
      fixedWidth,
    )
    expect(result.lines.length).toBe(2)
    expect(result.lines[1]!.endsWith('…')).toBe(true)
    expect(result.height).toBe(36)
  })

  it('maxWidth <= 0 时返回原文本单行', () => {
    const result = wrapText('hello', { font: '12px x', maxWidth: 0, lineHeight: 18 }, fixedWidth)
    expect(result.lines).toEqual(['hello'])
    expect(result.height).toBe(18)
  })
})
