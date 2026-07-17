import { describe, expect, it, mock } from 'bun:test'
import { FrameScheduler } from '@zhiguang/core'
import { DomGridHost } from '../../../src/dom/host/DomGridHost'
import type { WebPointerEvent } from '../../../src/dom/host/Host'

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

    expect(onPointerDown).toHaveBeenCalledWith({ x: 20, y: 44, shiftKey: false, button: 0, clientX: 20, clientY: 44 })
    expect(onPointerMove).toHaveBeenCalledWith({ x: 120, y: 72, shiftKey: false, button: 0, clientX: 120, clientY: 72 })
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

  it('overlay 滚动条（client 满宽）时右侧 track 条带不转发表格 pointer 事件', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 400 })
    Object.defineProperty(container, 'clientHeight', { value: 300 })
    document.body.appendChild(container)

    const onPointerDown = mock(() => {})
    const host = new DomGridHost({
      container,
      scheduler: new FrameScheduler(),
      onScroll: () => {},
      onResize: () => {},
      onPointerDown,
    })
    host.attach()

    const scrollHost = container.querySelector('[data-novasheet-scroll-host]') as HTMLDivElement
    scrollHost.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        toJSON: () => ({}),
      }) as DOMRect
    Object.defineProperty(scrollHost, 'clientWidth', { value: 400, configurable: true })
    Object.defineProperty(scrollHost, 'clientHeight', { value: 300, configurable: true })
    Object.defineProperty(scrollHost, 'offsetWidth', { value: 400, configurable: true })
    Object.defineProperty(scrollHost, 'offsetHeight', { value: 300, configurable: true })

    scrollHost.dispatchEvent(new PointerEvent('pointerdown', { clientX: 392, clientY: 120 }))
    scrollHost.dispatchEvent(new PointerEvent('pointerdown', { clientX: 120, clientY: 292 }))
    scrollHost.dispatchEvent(new PointerEvent('pointerdown', { clientX: 200, clientY: 150 }))

    expect(onPointerDown).toHaveBeenCalledTimes(1)
    expect(onPointerDown).toHaveBeenCalledWith({ x: 200, y: 150, shiftKey: false, button: 0, clientX: 200, clientY: 150 })

    host.destroy()
    document.body.removeChild(container)
  })
})

describe('DomGridHost — 滚动条交汇角', () => {
  const scrollbarTheme = {
    trackWidth: 15,
    trackColor: '#f8f9fa',
    thumbColor: '#bdc1c6',
    thumbHoverColor: '#9aa0a6',
    borderRadius: 8,
  }

  function makeAttachedHost() {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const host = new DomGridHost({
      container,
      scheduler: new FrameScheduler(),
      onScroll: () => {},
      onResize: () => {},
    })
    host.attach()
    const scrollHost = container.querySelector('[data-novasheet-scroll-host]') as HTMLDivElement
    const corner = container.querySelector('[data-novasheet-scrollbar-corner]') as HTMLDivElement
    return { container, host, scrollHost, corner }
  }

  function stubScrollbars(scrollHost: HTMLElement, vScrollbar: number, hScrollbar: number) {
    Object.defineProperty(scrollHost, 'offsetWidth', { value: 400, configurable: true })
    Object.defineProperty(scrollHost, 'clientWidth', { value: 400 - vScrollbar, configurable: true })
    Object.defineProperty(scrollHost, 'offsetHeight', { value: 300, configurable: true })
    Object.defineProperty(scrollHost, 'clientHeight', { value: 300 - hScrollbar, configurable: true })
  }

  it('两个经典滚动条都存在时按实测厚度显示角并填主题色', () => {
    const { container, host, scrollHost, corner } = makeAttachedHost()
    stubScrollbars(scrollHost, 15, 15)
    host.applyScrollbarTheme(scrollbarTheme)
    expect(corner.style.width).toBe('15px')
    expect(corner.style.height).toBe('15px')
    expect(corner.style.background).toBe('#f8f9fa')
    host.destroy()
    document.body.removeChild(container)
  })

  it('overlay / 无溢出（实测厚度为 0）时角隐藏，不盖画布右下角', () => {
    const { container, host, scrollHost, corner } = makeAttachedHost()
    stubScrollbars(scrollHost, 0, 0)
    host.applyScrollbarTheme(scrollbarTheme)
    expect(corner.style.width).toBe('0px')
    expect(corner.style.height).toBe('0px')
    expect(corner.style.background).toBe('transparent')
    host.destroy()
    document.body.removeChild(container)
  })

  it('仅单轴滚动条时角隐藏', () => {
    const { container, host, scrollHost, corner } = makeAttachedHost()
    stubScrollbars(scrollHost, 15, 0)
    host.applyScrollbarTheme(scrollbarTheme)
    expect(corner.style.width).toBe('0px')
    expect(corner.style.background).toBe('transparent')
    host.destroy()
    document.body.removeChild(container)
  })
})

describe('DomGridHost — viewport 尺寸', () => {
  it('经典滚动条占位时 getContainerSize 返回 scrollHost client 区，避免画布绘制到滚动条下方', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 400, configurable: true })
    Object.defineProperty(container, 'clientHeight', { value: 300, configurable: true })
    document.body.appendChild(container)

    const host = new DomGridHost({
      container,
      scheduler: new FrameScheduler(),
      onScroll: () => {},
      onResize: () => {},
    })
    host.attach()

    const scrollHost = container.querySelector('[data-novasheet-scroll-host]') as HTMLDivElement
    Object.defineProperty(scrollHost, 'clientWidth', { value: 385, configurable: true })
    Object.defineProperty(scrollHost, 'clientHeight', { value: 285, configurable: true })

    expect(host.getContainerSize()).toEqual({ width: 385, height: 285 })

    host.destroy()
    document.body.removeChild(container)
  })
})

describe('DomGridHost — contextmenu', () => {
  it('contextmenu on scroll-host invokes onContextMenu with local coords + clientX/Y', () => {
    const container = document.createElement('div')
    Object.assign(container.style, { width: '300px', height: '200px', position: 'relative' })
    document.body.appendChild(container)
    const onContextMenu = mock((_e: WebPointerEvent) => {})
    const scheduler = new FrameScheduler()
    const host = new DomGridHost({
      container,
      scheduler,
      onScroll: () => {},
      onResize: () => {},
      onContextMenu,
    })
    host.attach()
    const scrollHost = container.querySelector('[data-novasheet-scroll-host]') as HTMLElement
    // pin scroll-host bounding rect: (10, 5)
    scrollHost.getBoundingClientRect = () =>
      ({
        x: 10,
        y: 5,
        left: 10,
        top: 5,
        width: 300,
        height: 200,
        right: 310,
        bottom: 205,
        toJSON: () => ({}),
      }) as DOMRect
    const evt = new MouseEvent('contextmenu', {
      clientX: 40,
      clientY: 30,
      bubbles: true,
      cancelable: true,
    })
    scrollHost.dispatchEvent(evt)
    expect(onContextMenu).toHaveBeenCalledWith({
      x: 30,
      y: 25,
      shiftKey: false,
      button: 0,
      clientX: 40,
      clientY: 30,
    })
    expect(evt.defaultPrevented).toBe(true)
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
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    })
    const prevented = !scrollHost.dispatchEvent(event)

    expect(onKeyDown).toHaveBeenCalledWith({
      key: 'ArrowDown',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    expect(prevented).toBe(true)

    host.destroy()
    document.body.removeChild(container)
  })
})
