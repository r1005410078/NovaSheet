import { describe, expect, it } from 'bun:test'
import { richTextExtension } from '../../src/rich-text'

describe('richTextExtension (codec + renderer + editor)', () => {
  it('exposes codec (namespace richText) + renderer + editor', () => {
    expect(richTextExtension.codec.namespace).toBe('richText')
    expect(typeof richTextExtension.renderer.paint).toBe('function')
    expect(typeof richTextExtension.editor.open).toBe('function')
  })
})
