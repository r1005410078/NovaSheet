import { describe, expect, it } from 'bun:test'
import { ColumnReorderOverlay } from '../../../src/dom/overlay/ColumnReorderOverlay'

describe('ColumnReorderOverlay', () => {
  it('shows drag-following band and snapped drop line, then hides them', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const overlay = new ColumnReorderOverlay(root)

    overlay.show({ lineX: 240, dragBandX: 180, bandWidth: 260, height: 600 })

    const band = root.querySelector('[data-novasheet-column-reorder-band]') as HTMLElement
    const line = root.querySelector('[data-novasheet-column-reorder-line]') as HTMLElement
    expect(band.style.left).toBe('180px')
    expect(band.style.width).toBe('260px')
    expect(band.style.height).toBe('600px')
    expect(line.style.left).toBe('240px')
    expect(line.style.height).toBe('600px')

    overlay.hide()
    expect(band.style.display).toBe('none')
    expect(line.style.display).toBe('none')

    overlay.destroy()
    expect(root.querySelector('[data-novasheet-column-reorder-band]')).toBeNull()
    document.body.removeChild(root)
  })
})
