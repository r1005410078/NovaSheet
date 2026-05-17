import { describe, expect, it } from 'bun:test'
import { denseGridTheme } from '@novasheet/core'
import { applyScrollbarTheme, ensureScrollbarStylesheet } from '../../src/host/scrollbar-style'

describe('scrollbar-style', () => {
  it('注入全局滚动条样式表（幂等）', () => {
    ensureScrollbarStylesheet(document)
    const first = document.getElementById('novasheet-scrollbar-style')
    expect(first).not.toBeNull()
    ensureScrollbarStylesheet(document)
    expect(document.querySelectorAll('#novasheet-scrollbar-style').length).toBe(1)
  })

  it('将 Theme scrollbar token 写入 scroll-host CSS 变量', () => {
    const host = document.createElement('div')
    applyScrollbarTheme(host, denseGridTheme.scrollbar)
    expect(host.style.getPropertyValue('--ns-scrollbar-size')).toBe('10px')
    expect(host.style.getPropertyValue('--ns-scrollbar-thumb')).toBe(
      denseGridTheme.scrollbar.thumbColor,
    )
    expect(host.style.getPropertyValue('--ns-scrollbar-thumb-hover')).toBe(
      denseGridTheme.scrollbar.thumbHoverColor,
    )
  })
})
