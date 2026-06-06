import { describe, expect, it } from 'bun:test'
import { RowReorderOverlay } from '../../../src/dom/overlay/RowReorderOverlay'

describe('RowReorderOverlay', () => {
  it('shows drag-following row band and snapped drop line, then hides them', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const overlay = new RowReorderOverlay(root)

    overlay.show({ lineY: 144, dragBandY: 88, bandHeight: 56, width: 500 })

    const band = root.querySelector('[data-novasheet-row-reorder-band]') as HTMLElement
    const line = root.querySelector('[data-novasheet-row-reorder-line]') as HTMLElement
    expect(band.style.top).toBe('88px')
    expect(band.style.height).toBe('56px')
    expect(band.style.width).toBe('500px')
    expect(line.style.top).toBe('144px')
    expect(line.style.width).toBe('500px')

    overlay.hide()
    expect(band.style.display).toBe('none')
    expect(line.style.display).toBe('none')

    overlay.destroy()
    expect(root.querySelector('[data-novasheet-row-reorder-band]')).toBeNull()
    document.body.removeChild(root)
  })
})
