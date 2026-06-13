import { describe, expect, it } from 'bun:test'
import { normalize } from '../../src/rich-text/normalize'
import type { TextRun } from '../../src/rich-text/types'

const run = (start: number, end: number, attrs: TextRun['attrs'] = {}): TextRun => ({ start, end, attrs })

describe('normalize', () => {
  it('drops empty/inverted runs and clamps to text bounds', () => {
    const out = normalize([run(2, 2, { bold: true }), run(-1, 3, { italic: true }), run(4, 99, { bold: true })], 'hello')
    // [-1,3)→[0,3)，[2,2) 丢弃，[4,99)→[4,5)
    expect(out).toEqual([run(0, 3, { italic: true }), run(4, 5, { bold: true })])
  })

  it('sorts by start ascending', () => {
    const out = normalize([run(3, 5, { bold: true }), run(0, 2, { italic: true })], 'abcdef')
    expect(out.map((r) => r.start)).toEqual([0, 3])
  })

  it('merges adjacent runs with deep-equal attrs', () => {
    const out = normalize([run(0, 2, { bold: true }), run(2, 4, { bold: true })], 'abcd')
    expect(out).toEqual([run(0, 4, { bold: true })])
  })

  it('does NOT merge adjacent runs with differing attrs', () => {
    const out = normalize([run(0, 2, { bold: true }), run(2, 4, { italic: true })], 'abcd')
    expect(out.length).toBe(2)
  })

  it('snaps start/end off surrogate-pair boundaries (no half char)', () => {
    // '😀' = U+1F600 = 2 code units [0,1]; 'a😀b' → indices a=0, hi=1, lo=2, b=3
    const text = 'a\u{1F600}b'
    // run [0,2) 会切在 😀 中间（end=2 落在 low surrogate 后？end=2 指向 b 前，合法）
    // 用 [2,3) 起点落在 low surrogate（index 2）→ 须 snap 回 1（high surrogate）
    const out = normalize([run(2, 3, { bold: true })], text)
    expect(out[0]?.start).toBe(1) // snap 向外扩到 high surrogate
    expect(out[0]?.end).toBe(3)
  })

  it('empty input → empty output', () => {
    expect(normalize([], 'abc')).toEqual([])
  })
})
