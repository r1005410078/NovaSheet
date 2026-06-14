import { describe, expect, it } from 'bun:test'
import { richTextToHtml, htmlElementToRichText } from '../../src/rich-text/serialize'
import type { RichTextValue } from '../../src/rich-text/types'

describe('richTextToHtml', () => {
  it('no runs → escaped plain text in single span', () => {
    expect(richTextToHtml('a<b>', [])).toBe('<span>a&lt;b&gt;</span>')
  })
  it('bold middle run → 3 spans, middle has font-weight', () => {
    const runs: RichTextValue = [{ start: 1, end: 3, attrs: { bold: true } }]
    const html = richTextToHtml('abcd', runs)
    expect(html).toBe('<span>a</span><span style="font-weight:bold">bc</span><span>d</span>')
  })
  it('newline → <br>', () => {
    expect(richTextToHtml('a\nb', [])).toBe('<span>a</span><br><span>b</span>')
  })
  it('escapes double-quote in style value (no attribute break)', () => {
    const runs: RichTextValue = [{ start: 0, end: 1, attrs: { fontFamily: '"Foo' } }]
    const html = richTextToHtml('x', runs)
    expect(html).not.toContain('font-family:"Foo"')
    expect(html).toContain('&quot;Foo')
  })
})

describe('htmlElementToRichText', () => {
  it('round-trips bold substring', () => {
    const root = document.createElement('div')
    root.innerHTML = richTextToHtml('abcd', [{ start: 1, end: 3, attrs: { bold: true } }])
    const { text, runs } = htmlElementToRichText(root)
    expect(text).toBe('abcd')
    expect(runs).toEqual([{ start: 1, end: 3, attrs: { bold: true } }])
  })
  it('extracts color + italic + underline from inline style', () => {
    const root = document.createElement('div')
    root.innerHTML = '<span style="font-style:italic;text-decoration:underline;color:#ff0000">hi</span>'
    const { text, runs } = htmlElementToRichText(root)
    expect(text).toBe('hi')
    expect(runs[0]?.attrs.italic).toBe(true)
    expect(runs[0]?.attrs.underline).toBe(true)
    expect(runs[0]?.attrs.color).toBe('#ff0000')
  })
  it('<br> → \\n with +1 offset', () => {
    const root = document.createElement('div')
    root.innerHTML = '<span>a</span><br><span>b</span>'
    expect(htmlElementToRichText(root).text).toBe('a\nb')
  })
})
