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

describe('DomHandleLayer — 位置复用池', () => {
  function makeLayer() {
    const container = document.createElement('div')
    Object.assign(container.style, { position: 'relative', width: '400px', height: '300px' })
    document.body.appendChild(container)
    const layer = new DomHandleLayer(container, {
      onResizePointerDown: mock(() => {}),
      onResizePointerMove: mock(() => {}),
      onResizePointerUp: mock(() => {}),
      onResizeKeyboard: mock(() => {}),
    })
    layer.attach()
    return { container, layer }
  }

  function rowHandle(rowIndex: number): Parameters<DomHandleLayer['sync']>[0][number] {
    return {
      kind: 'row',
      id: `row-${rowIndex}`,
      rowIndex,
      x: 0,
      y: rowIndex * 28 - 4,
      width: 48,
      height: 8,
    }
  }

  it('行号整体位移时复用既有节点：零增删、dataset 与位置更新', () => {
    const { container, layer } = makeLayer()
    layer.sync([rowHandle(0), rowHandle(1), rowHandle(2)])
    const before = [...container.querySelectorAll('[data-novasheet-resize-handle]')]
    expect(before.length).toBe(3)

    // 模拟向下滚动 5 行：行号全变，数量不变
    layer.sync([rowHandle(5), rowHandle(6), rowHandle(7)])
    const after = [...container.querySelectorAll('[data-novasheet-resize-handle]')]
    expect(after.length).toBe(3)
    // 元素身份完全复用（零 createElement / remove）
    expect(after[0]).toBe(before[0]!)
    expect(after[1]).toBe(before[1]!)
    expect(after[2]).toBe(before[2]!)
    // dataset 与位置已更新（readHandle 依赖 dataset）
    expect((after[0] as HTMLElement).dataset['rowIndex']).toBe('5')
    expect((after[2] as HTMLElement).dataset['rowIndex']).toBe('7')
    expect((after[0] as HTMLElement).style.top).toBe(`${5 * 28 - 4}px`)

    layer.destroy()
    document.body.removeChild(container)
  })

  it('数量缩减时裁掉多余节点，扩张时只补差额', () => {
    const { container, layer } = makeLayer()
    layer.sync([rowHandle(0), rowHandle(1), rowHandle(2)])
    layer.sync([rowHandle(0)])
    expect(container.querySelectorAll('[data-novasheet-resize-handle]').length).toBe(1)

    const survivor = container.querySelector('[data-novasheet-resize-handle]')
    layer.sync([rowHandle(0), rowHandle(1)])
    const grown = [...container.querySelectorAll('[data-novasheet-resize-handle]')]
    expect(grown.length).toBe(2)
    expect(grown[0]).toBe(survivor!) // 幸存节点仍被复用

    layer.destroy()
    document.body.removeChild(container)
  })

  it('列与行分池：列 handle 不会被复用为行 handle', () => {
    const { container, layer } = makeLayer()
    layer.sync([
      { kind: 'column', id: 'name', fieldId: 'name', colIndex: 0, x: 96, y: 0, width: 8, height: 32 },
    ])
    const colEl = container.querySelector('[data-novasheet-resize-handle]') as HTMLElement
    expect(colEl.style.cursor).toBe('col-resize')

    layer.sync([rowHandle(0)])
    const rowEl = container.querySelector('[data-novasheet-resize-handle]') as HTMLElement
    expect(rowEl).not.toBe(colEl)
    expect(rowEl.style.cursor).toBe('row-resize')
    expect(rowEl.dataset['nsResize']).toBe('row')

    layer.destroy()
    document.body.removeChild(container)
  })
})
