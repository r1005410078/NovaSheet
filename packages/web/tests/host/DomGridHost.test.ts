import { describe, expect, it, mock } from 'bun:test'
import { FrameScheduler } from '@novasheet/core'
import { DomGridHost } from '../../src/host/DomGridHost'

describe('DomGridHost — DPR 监听', () => {
  it('destroy 时 removeEventListener，销毁后 handler 不再触发', () => {
    const removeSpy = mock(() => {})
    const handlerRef: { current: (() => void) | null } = { current: null }
    const mql = {
      addEventListener: mock((_type: string, handler: () => void) => {
        handlerRef.current = handler
      }),
      removeEventListener: removeSpy,
    }
    const originalMatchMedia = window.matchMedia
    window.matchMedia = (() => mql) as unknown as typeof window.matchMedia

    const container = document.createElement('div')
    document.body.appendChild(container)
    const onDprChange = mock(() => {})
    const host = new DomGridHost({
      container,
      scheduler: new FrameScheduler(),
      onScroll: () => {},
      onResize: () => {},
      onDprChange,
    })
    host.attach()
    host.destroy()

    expect(removeSpy).toHaveBeenCalledWith('change', handlerRef.current)

    if (handlerRef.current) {
      handlerRef.current()
    }
    expect(onDprChange).not.toHaveBeenCalled()

    window.matchMedia = originalMatchMedia
    document.body.removeChild(container)
  })
})

describe('DomGridHost — pointer events', () => {
  it('转发 pointerdown/move/up，并在 destroy 时解绑', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 400 })
    Object.defineProperty(container, 'clientHeight', { value: 300 })
    document.body.appendChild(container)

    const onPointerDown = mock(() => {})
    const onPointerMove = mock(() => {})
    const onPointerUp = mock(() => {})
    const host = new DomGridHost({
      container,
      scheduler: new FrameScheduler(),
      onScroll: () => {},
      onResize: () => {},
      onPointerDown,
      onPointerMove,
      onPointerUp,
    })
    host.attach()

    const scrollHost = container.querySelector('[data-novasheet-scroll-host]') as HTMLDivElement
    scrollHost.dispatchEvent(new PointerEvent('pointerdown', { clientX: 20, clientY: 44 }))
    scrollHost.dispatchEvent(new PointerEvent('pointermove', { clientX: 120, clientY: 72 }))
    scrollHost.dispatchEvent(new PointerEvent('pointerup', { clientX: 120, clientY: 72 }))

    expect(onPointerDown).toHaveBeenCalledWith({ x: 20, y: 44, shiftKey: false })
    expect(onPointerMove).toHaveBeenCalledWith({ x: 120, y: 72, shiftKey: false })
    expect(onPointerUp).toHaveBeenCalledTimes(1)

    host.destroy()
    scrollHost.dispatchEvent(new PointerEvent('pointerdown', { clientX: 1, clientY: 1 }))
    scrollHost.dispatchEvent(new PointerEvent('pointermove', { clientX: 1, clientY: 1 }))
    scrollHost.dispatchEvent(new PointerEvent('pointerup', { clientX: 1, clientY: 1 }))

    expect(onPointerDown).toHaveBeenCalledTimes(1)
    expect(onPointerMove).toHaveBeenCalledTimes(1)
    expect(onPointerUp).toHaveBeenCalledTimes(1)

    document.body.removeChild(container)
  })

  it('点击原生滚动条区域时不转发表格 pointer 事件', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 400 })
    Object.defineProperty(container, 'clientHeight', { value: 300 })
    document.body.appendChild(container)

    const onPointerDown = mock(() => {})
    const onPointerMove = mock(() => {})
    const host = new DomGridHost({
      container,
      scheduler: new FrameScheduler(),
      onScroll: () => {},
      onResize: () => {},
      onPointerDown,
      onPointerMove,
    })
    host.attach()

    const scrollHost = container.querySelector('[data-novasheet-scroll-host]') as HTMLDivElement
    Object.defineProperty(scrollHost, 'clientWidth', { value: 385 })
    Object.defineProperty(scrollHost, 'clientHeight', { value: 285 })

    scrollHost.dispatchEvent(new PointerEvent('pointerdown', { clientX: 390, clientY: 120 }))
    scrollHost.dispatchEvent(new PointerEvent('pointermove', { clientX: 390, clientY: 140 }))
    scrollHost.dispatchEvent(new PointerEvent('pointerdown', { clientX: 120, clientY: 290 }))
    scrollHost.dispatchEvent(new PointerEvent('pointermove', { clientX: 140, clientY: 290 }))

    expect(onPointerDown).not.toHaveBeenCalled()
    expect(onPointerMove).not.toHaveBeenCalled()

    host.destroy()
    document.body.removeChild(container)
  })
})

describe('DomGridHost — keyboard events', () => {
  it('转发 keydown 并在 handled 时 preventDefault', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 400 })
    Object.defineProperty(container, 'clientHeight', { value: 300 })
    document.body.appendChild(container)

    const onKeyDown = mock(() => true)
    const host = new DomGridHost({
      container,
      scheduler: new FrameScheduler(),
      onScroll: () => {},
      onResize: () => {},
      onKeyDown,
    })
    host.attach()

    const scrollHost = container.querySelector('[data-novasheet-scroll-host]') as HTMLDivElement
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    const prevented = !scrollHost.dispatchEvent(event)

    expect(onKeyDown).toHaveBeenCalledWith({ key: 'ArrowDown', shiftKey: false })
    expect(prevented).toBe(true)

    host.destroy()
    document.body.removeChild(container)
  })
})
