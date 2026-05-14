import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FrameScheduler } from '../../src/util/raf'

describe('FrameScheduler', () => {
  let rafs: Array<() => void> = []

  beforeEach(() => {
    rafs = []
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
      rafs.push(cb)
      return rafs.length
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function flushFrame() {
    const pending = rafs
    rafs = []
    for (const cb of pending) cb()
  }

  it('schedules a single RAF for one task', () => {
    const scheduler = new FrameScheduler()
    const fn = vi.fn()
    scheduler.schedule('a', fn)
    expect(rafs).toHaveLength(1)
    flushFrame()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('coalesces multiple schedule calls into one RAF', () => {
    const scheduler = new FrameScheduler()
    scheduler.schedule('a', vi.fn())
    scheduler.schedule('b', vi.fn())
    scheduler.schedule('c', vi.fn())
    expect(rafs).toHaveLength(1)
  })

  it('same key collapses to last task', () => {
    const scheduler = new FrameScheduler()
    const first = vi.fn()
    const second = vi.fn()
    scheduler.schedule('a', first)
    scheduler.schedule('a', second)
    flushFrame()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('executes tasks in insertion order', () => {
    const scheduler = new FrameScheduler()
    const log: string[] = []
    scheduler.schedule('first', () => log.push('1'))
    scheduler.schedule('second', () => log.push('2'))
    scheduler.schedule('third', () => log.push('3'))
    flushFrame()
    expect(log).toEqual(['1', '2', '3'])
  })

  it('cancel removes a pending task', () => {
    const scheduler = new FrameScheduler()
    const fn = vi.fn()
    scheduler.schedule('a', fn)
    scheduler.cancel('a')
    flushFrame()
    expect(fn).not.toHaveBeenCalled()
  })

  it('schedules a new frame after flush', () => {
    const scheduler = new FrameScheduler()
    scheduler.schedule('a', vi.fn())
    flushFrame()
    scheduler.schedule('b', vi.fn())
    expect(rafs).toHaveLength(1)
  })
})
