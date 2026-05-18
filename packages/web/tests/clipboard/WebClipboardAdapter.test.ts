import { afterEach, describe, expect, it, mock } from 'bun:test'
import { WebClipboardAdapter } from '../../src/clipboard/WebClipboardAdapter'

/** happy-dom 的 navigator 是只读全局，但 navigator.clipboard 子属性可通过 defineProperty 覆盖。 */
function setClipboard(clipboard: unknown): void {
  Object.defineProperty(navigator, 'clipboard', {
    value: clipboard,
    configurable: true,
    writable: true,
  })
}

afterEach(() => setClipboard(undefined))

describe('WebClipboardAdapter', () => {
  it('writeText 走 navigator.clipboard.writeText', async () => {
    const writeText = mock(async (_: string) => {})
    setClipboard({ writeText })
    const adapter = new WebClipboardAdapter()
    expect(await adapter.writeText('hello')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('readText 走 navigator.clipboard.readText', async () => {
    const readText = mock(async () => 'world')
    setClipboard({ readText })
    const adapter = new WebClipboardAdapter()
    expect(await adapter.readText()).toBe('world')
  })

  it('clipboard API 不存在时：writeText 返回 false / readText 返回 null', async () => {
    setClipboard(undefined)
    const adapter = new WebClipboardAdapter()
    expect(await adapter.writeText('x')).toBe(false)
    expect(await adapter.readText()).toBe(null)
  })

  it('writeText 抛错（如权限）→ 返回 false，不抛', async () => {
    setClipboard({
      writeText: mock(async () => {
        throw new Error('denied')
      }),
    })
    const adapter = new WebClipboardAdapter()
    expect(await adapter.writeText('x')).toBe(false)
  })

  it('readText 抛错 → 返回 null，不抛', async () => {
    setClipboard({
      readText: mock(async () => {
        throw new Error('denied')
      }),
    })
    const adapter = new WebClipboardAdapter()
    expect(await adapter.readText()).toBe(null)
  })
})
