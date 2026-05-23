import { describe, expect, it } from 'bun:test'
import { denseGridTheme } from '@novasheet/core'
import {
  applyResizeHandleTheme,
  ensureResizeHandleStylesheet,
} from '../../src/host/resize-handle-style'

describe('resize-handle-style', () => {
  it('注入样式表并写入 CSS 变量', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    ensureResizeHandleStylesheet()
    applyResizeHandleTheme(host, denseGridTheme.colors, denseGridTheme.metrics)

    expect(document.getElementById('novasheet-resize-handle-style')).not.toBeNull()
    expect(host.style.getPropertyValue('--ns-resize-grip')).toBe(denseGridTheme.colors.headerText)
    expect(host.style.getPropertyValue('--ns-resize-grip-active')).toBe(
      denseGridTheme.colors.selectionBorder,
    )

    document.body.removeChild(host)
  })
})
