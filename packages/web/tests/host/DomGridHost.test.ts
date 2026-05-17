import { describe, expect, it, mock } from 'bun:test'
import { FrameScheduler } from '@novasheet/core'
import { DomGridHost } from '../../src/host/DomGridHost'

describe('DomGridHost DPR watcher', () => {
  it('removeEventListener on destroy so handler does not fire after teardown', () => {
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
