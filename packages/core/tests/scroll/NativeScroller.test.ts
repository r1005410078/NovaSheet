import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { NativeScroller } from '../../src/scroll/NativeScroller'
import { FrameScheduler } from '../../src/util/raf'

describe('NativeScroller', () => {
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
    Object.defineProperty(el, 'scrollTop', { value: initialTop, writable: true, configurable: true })
    Object.defineProperty(el, 'scrollLeft', { value: initialLeft, writable: true, configurable: true })
    el.scrollTo = ((opts: { top?: number; left?: number }) => {
      if (opts.top !== undefined) (el as unknown as { scrollTop: number }).scrollTop = opts.top
      if (opts.left !== undefined) (el as unknown as { scrollLeft: number }).scrollLeft = opts.left
    }) as HTMLElement['scrollTo']
    return el
  }

  it('attach() registers a scroll listener; destroy() removes it', () => {
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

  it('scroll event schedules a frame via FrameScheduler', () => {
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
    expect(onScroll).toHaveBeenCalledWith(200, 50)
  })

  it('multiple scroll events in one frame collapse to a single callback (key dedup)', () => {
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
    expect(onScroll).toHaveBeenCalledWith(300, 0) // last write wins via host's current state
  })

  it('scrollTo() sets scrollHost.scrollTop and scrollLeft', () => {
    const host = makeScrollHost(0, 0)
    const scroller = new NativeScroller(host, new FrameScheduler(), mock(() => {}))
    scroller.scrollTo(150, 75)
    expect(host.scrollTop).toBe(150)
    expect(host.scrollLeft).toBe(75)
  })

  it('destroy() before attach() does not throw', () => {
    const host = makeScrollHost()
    const scroller = new NativeScroller(host, new FrameScheduler(), mock(() => {}))
    expect(() => scroller.destroy()).not.toThrow()
  })

  it('callbacks after destroy() are silently ignored', () => {
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
