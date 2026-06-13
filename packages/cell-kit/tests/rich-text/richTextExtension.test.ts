import { describe, expect, it } from 'bun:test'
import { richTextExtension } from '../../src/rich-text'

describe('richTextExtension (display half)', () => {
  it('exposes codec (namespace richText) + renderer', () => {
    expect(richTextExtension.codec.namespace).toBe('richText')
    expect(typeof richTextExtension.renderer.paint).toBe('function')
  })
})
