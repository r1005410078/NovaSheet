import { describe, expect, it, mock } from 'bun:test'
import { DomHandleLayer } from '../../../src/dom/interaction/DomHandleLayer'

describe('DomHandleLayer — Phase 3.4', () => {
  it('sync 创建列/行 handle 节点并在移除时回收', () => {
    const container = document.createElement('div')
    Object.assign(container.style, { position: 'relative', width: '400px', height: '300px' })
    document.body.appendChild(container)

    const onResizePointerDown = mock(() => {})
    const layer = new DomHandleLayer(container, {
      onResizePointerDown,
      onResizePointerMove: mock(() => {}),
      onResizePointerUp: mock(() => {}),
      onResizeKeyboard: mock(() => {}),
    })
    layer.attach()

    layer.sync([
      {
        kind: 'column',
        id: 'name',
        fieldId: 'name',
        colIndex: 0,
        x: 96,
        y: 0,
        width: 8,
        height: 32,
      },
    ])

    const handles = container.querySelectorAll('[data-novasheet-resize-handle]')
    expect(handles.length).toBe(1)
    const handle = handles[0] as HTMLElement
    expect(handle.style.cursor).toBe('col-resize')
    expect(handle.querySelectorAll('[data-novasheet-resize-grip]').length).toBe(2)
    expect(document.getElementById('novasheet-resize-handle-style')).not.toBeNull()

    layer.sync([])
    expect(container.querySelectorAll('[data-novasheet-resize-handle]').length).toBe(0)

    layer.destroy()
    document.body.removeChild(container)
  })
})
