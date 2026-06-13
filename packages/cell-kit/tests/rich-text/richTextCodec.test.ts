import { describe, expect, it } from 'bun:test'
import { richTextCodec } from '../../src/rich-text/richTextCodec'
import type { RichTextValue } from '../../src/rich-text/types'

describe('richTextCodec', () => {
  it('registers namespace "richText"', () => {
    expect(richTextCodec.namespace).toBe('richText')
  })

  it('round-trips runs through serialize/deserialize', () => {
    const runs: RichTextValue = [
      { start: 0, end: 3, attrs: { bold: true, color: '#a00' } },
      { start: 5, end: 8, attrs: { italic: true, fontSize: 18 } },
    ]
    const text = richTextCodec.serialize(runs)
    expect(typeof text).toBe('string')
    expect(richTextCodec.deserialize(text)).toEqual(runs)
  })

  it('deserialize returns undefined on malformed JSON', () => {
    expect(richTextCodec.deserialize('not json')).toBeUndefined()
  })

  it('deserialize returns undefined on wrong shape (not array of runs)', () => {
    expect(richTextCodec.deserialize('{"foo":1}')).toBeUndefined()
    expect(richTextCodec.deserialize('[{"start":0}]')).toBeUndefined() // 缺 end/attrs
  })
})
