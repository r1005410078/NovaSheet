import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { NativeScroller } from '../../../src/dom/scroll/NativeScroller'
import { FrameScheduler } from '@zhiguang/novasheet-core'

describe('NativeScroller — 原生滚动', () => {
  let rafs: Array<() => void> = []
  let originalRaf: typeof requestAnimationFrame

  beforeEach(() => {
    rafs = []
    originalRaf = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = ((cb: () => void) => {
      rafs.push(cb)
      return rafs.length
    }) as typeof requestAnimationFrame
  })

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf
  })

  function flushFrame() {
    const pending = rafs
    rafs = []
    for (const cb of pending) cb()
  }

  function makeScrollHost(initialTop = 0, initialLeft = 0): HTMLElement {
    const el = document.createElement('div')
    Object.defineProperty(el, 'scrollTop', {
      value: initialTop,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(el, 'scrollLeft', {
      value: initialLeft,
      writable: true,
      configurable: true,
    })
    el.scrollTo = ((opts: { top?: number; left?: number }) => {
      if (opts.top !== undefined) (el as unknown as { scrollTop: number }).scrollTop = opts.top
      if (opts.left !== undefined) (el as unknown as { scrollLeft: number }).scrollLeft = opts.left
    }) as HTMLElement['scrollTo']
    return el
  }

  it('attach 注册 scroll 监听，destroy 移除', () => {
    const host = makeScrollHost()
    const onScroll = mock(() => {})
    const scroller = new NativeScroller(host, new FrameScheduler(), onScroll)
    const addSpy = spyOn(host, 'addEventListener')
    const removeSpy = spyOn(host, 'removeEventListener')
    scroller.attach()
    expect(addSpy).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true })
    scroller.destroy()
    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function))
  })

  it('scroll 事件经 FrameScheduler 调度到下一帧', () => {
    const host = makeScrollHost(0, 0)
    const onScroll = mock(() => {})
    const scroller = new NativeScroller(host, new FrameScheduler(), onScroll)
    scroller.attach()
    ;(host as unknown as { scrollTop: number }).scrollTop = 200
    ;(host as unknown as { scrollLeft: number }).scrollLeft = 50
    host.dispatchEvent(new Event('scroll'))
    expect(rafs).toHaveLength(1)
    expect(onScroll).not.toHaveBeenCalled()
    flushFrame()
    expect(onScroll).toHaveBeenCalledWith(200, 50, { kind: 'scrollbar', atMs: expect.any(Number) })
  })

  it('同帧多次 scroll 合并为一次回调', () => {
    const host = makeScrollHost(0, 0)
    const onScroll = mock(() => {})
    const scroller = new NativeScroller(host, new FrameScheduler(), onScroll)
    scroller.attach()
    ;(host as unknown as { scrollTop: number }).scrollTop = 100
    host.dispatchEvent(new Event('scroll'))
    ;(host as unknown as { scrollTop: number }).scrollTop = 200
    host.dispatchEvent(new Event('scroll'))
    ;(host as unknown as { scrollTop: number }).scrollTop = 300
    host.dispatchEvent(new Event('scroll'))
    expect(rafs).toHaveLength(1)
    flushFrame()
    expect(onScroll).toHaveBeenCalledTimes(1)
    expect(onScroll).toHaveBeenCalledWith(300, 0, { kind: 'scrollbar', atMs: expect.any(Number) }) // last write wins via host's current state
  })

  it('scrollTo 设置 scrollTop/scrollLeft', () => {
    const host = makeScrollHost(0, 0)
    const scroller = new NativeScroller(
      host,
      new FrameScheduler(),
      mock(() => {}),
    )
    scroller.scrollTo(150, 75)
    expect(host.scrollTop).toBe(150)
    expect(host.scrollLeft).toBe(75)
  })

  it('wheel 后的 scroll 回调携带 wheel intent', () => {
    const host = makeScrollHost(0, 0)
    const onScroll = mock(() => {})
    const scroller = new NativeScroller(host, new FrameScheduler(), onScroll)
    scroller.attach()
    host.dispatchEvent(new WheelEvent('wheel', { deltaX: 4, deltaY: 120 }))
    ;(host as unknown as { scrollTop: number }).scrollTop = 240
    host.dispatchEvent(new Event('scroll'))
    flushFrame()
    expect(onScroll).toHaveBeenCalledWith(240, 0, {
      kind: 'wheel',
      atMs: expect.any(Number),
      deltaX: 4,
      deltaY: 120,
    })
  })

  it('scrollTo 触发的 scroll 回调携带 programmatic intent', () => {
    const host = makeScrollHost(0, 0)
    const onScroll = mock(() => {})
    const scroller = new NativeScroller(host, new FrameScheduler(), onScroll)
    scroller.attach()
    scroller.scrollTo(150, 75)
    host.dispatchEvent(new Event('scroll'))
    flushFrame()
    expect(onScroll).toHaveBeenCalledWith(150, 75, {
      kind: 'programmatic',
      atMs: expect.any(Number),
    })
  })

  it('未 attach 就 destroy 不抛错', () => {
    const host = makeScrollHost()
    const scroller = new NativeScroller(
      host,
      new FrameScheduler(),
      mock(() => {}),
    )
    expect(() => scroller.destroy()).not.toThrow()
  })

  it('destroy 后的回调被忽略', () => {
    const host = makeScrollHost()
    const onScroll = mock(() => {})
    const scroller = new NativeScroller(host, new FrameScheduler(), onScroll)
    scroller.attach()
    ;(host as unknown as { scrollTop: number }).scrollTop = 100
    host.dispatchEvent(new Event('scroll'))
    scroller.destroy()
    flushFrame()
    expect(onScroll).not.toHaveBeenCalled()
  })
})
