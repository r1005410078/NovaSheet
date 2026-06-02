import { describe, expect, it, mock } from 'bun:test'
import { DomFillHandleLayer } from '../src/DomFillHandleLayer'

describe('DomFillHandleLayer', () => {
  it('attaches, syncs handle, and destroys', () => {
    const root = document.createElement('div')
    const layer = new DomFillHandleLayer(root, callbacks())
    layer.attach()
    layer.sync({ x: 10, y: 20, width: 8, height: 8 })
    const handle = root.querySelector('[data-novasheet-fill-handle]') as HTMLElement
    expect(handle.style.left).toBe('10px')
    expect(handle.style.top).toBe('20px')
    expect(handle.style.borderRadius).toBe('50%')
    layer.sync(null)
    expect(handle.style.display).toBe('none')
    layer.destroy()
    expect(root.querySelector('[data-novasheet-fill-layer]')).toBeNull()
  })

  it('shows and hides preview rects', () => {
    const root = document.createElement('div')
    const layer = new DomFillHandleLayer(root, callbacks())
    layer.attach()
    layer.showPreview([
      { x: 0, y: 0, width: 100, height: 30 },
      { x: 0, y: 30, width: 100, height: 30 },
    ])
    expect(root.querySelectorAll('[data-novasheet-fill-preview]').length).toBe(2)
    const preview = root.querySelector('[data-novasheet-fill-preview]') as HTMLElement
    expect(preview.style.borderStyle).toBe('dashed')
    expect(preview.style.borderWidth).toBe('1px')
    expect(preview.style.opacity).toBe('0.72')
    layer.hidePreview()
    expect(root.querySelectorAll('[data-novasheet-fill-preview]').length).toBe(0)
  })

  it('forwards pointer events from the handle', () => {
    const cb = callbacks()
    const root = document.createElement('div')
    const layer = new DomFillHandleLayer(root, cb)
    layer.attach()
    layer.sync({ x: 10, y: 20, width: 8, height: 8 })
    const handle = root.querySelector('[data-novasheet-fill-handle]') as HTMLElement

    handle.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 7, clientX: 14, clientY: 24, bubbles: true }),
    )
    handle.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 7, clientX: 20, clientY: 40, bubbles: true }),
    )
    handle.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, bubbles: true }))

    expect(cb.onFillPointerDown).toHaveBeenCalledWith(7, 14, 24)
    expect(cb.onFillPointerMove).toHaveBeenCalledWith(7, 20, 40)
    expect(cb.onFillPointerUp).toHaveBeenCalledWith(7)
  })
})

function callbacks() {
  return {
    onFillPointerDown: mock(() => {}),
    onFillPointerMove: mock(() => {}),
    onFillPointerUp: mock(() => {}),
  }
}
