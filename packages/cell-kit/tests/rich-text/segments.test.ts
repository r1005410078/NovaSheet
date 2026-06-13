import { describe, expect, it } from 'bun:test'
import { splitIntoSegments, type CellTextDefault } from '../../src/rich-text/segments'
import type { RichTextValue } from '../../src/rich-text/types'

const def: CellTextDefault = { fontSize: 12, fontFamily: 'Arial', color: '#000' }

describe('splitIntoSegments', () => {
  it('no runs → single default segment', () => {
    expect(splitIntoSegments('hello', [], def)).toEqual([
      { text: 'hello', font: '12px Arial', fontSize: 12, color: '#000', underline: false, strikethrough: false },
    ])
  })

  it('run in middle → 3 segments (gap, run, gap) with merged attrs', () => {
    const runs: RichTextValue = [{ start: 2, end: 4, attrs: { bold: true, color: '#f00' } }]
    const segs = splitIntoSegments('abcdef', runs, def)
    expect(segs.map((s) => s.text)).toEqual(['ab', 'cd', 'ef'])
    expect(segs[1]?.font).toBe('bold 12px Arial')
    expect(segs[1]?.color).toBe('#f00')
    expect(segs[0]?.color).toBe('#000')
  })

  it('run attrs override fontSize/family/italic into font string', () => {
    const runs: RichTextValue = [{ start: 0, end: 2, attrs: { italic: true, bold: true, fontSize: 20, fontFamily: 'Times' } }]
    const segs = splitIntoSegments('ab', runs, def)
    expect(segs[0]?.font).toBe('italic bold 20px Times')
    expect(segs[0]?.fontSize).toBe(20)
  })

  it('run carries underline/strikethrough flags', () => {
    const runs: RichTextValue = [{ start: 0, end: 1, attrs: { underline: true, strikethrough: true } }]
    const segs = splitIntoSegments('a', runs, def)
    expect(segs[0]?.underline).toBe(true)
    expect(segs[0]?.strikethrough).toBe(true)
  })
})
