import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { stubGlobal, unstubAllGlobals } from '../helpers/global-stub'
import { FrameScheduler } from '../../src/util/raf'

describe('FrameScheduler — RAF 调度', () => {
  let rafs: Array<() => void> = []

  beforeEach(() => {
    rafs = []
    stubGlobal('requestAnimationFrame', (cb: () => void) => {
      rafs.push(cb)
      return rafs.length
    })
  })

  afterEach(() => {
    unstubAllGlobals()
  })

  function flushFrame() {
    const pending = rafs
    rafs = []
    for (const cb of pending) cb()
  }

  it('单任务调度一次 RAF', () => {
    const scheduler = new FrameScheduler()
    const fn = mock(() => {})
    scheduler.schedule('a', fn)
    expect(rafs).toHaveLength(1)
    flushFrame()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('多次 schedule 合并为一次 RAF', () => {
    const scheduler = new FrameScheduler()
    scheduler.schedule('a', mock(() => {}))
    scheduler.schedule('b', mock(() => {}))
    scheduler.schedule('c', mock(() => {}))
    expect(rafs).toHaveLength(1)
  })

  it('同 key 只保留最后一次 task', () => {
    const scheduler = new FrameScheduler()
    const first = mock(() => {})
    const second = mock(() => {})
    scheduler.schedule('a', first)
    scheduler.schedule('a', second)
    flushFrame()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('按插入顺序执行任务', () => {
    const scheduler = new FrameScheduler()
    const log: string[] = []
    scheduler.schedule('first', () => log.push('1'))
    scheduler.schedule('second', () => log.push('2'))
    scheduler.schedule('third', () => log.push('3'))
    flushFrame()
    expect(log).toEqual(['1', '2', '3'])
  })

  it('cancel 移除 pending 任务', () => {
    const scheduler = new FrameScheduler()
    const fn = mock(() => {})
    scheduler.schedule('a', fn)
    scheduler.cancel('a')
    flushFrame()
    expect(fn).not.toHaveBeenCalled()
  })

  it('flush 后可再调度新帧', () => {
    const scheduler = new FrameScheduler()
    scheduler.schedule('a', mock(() => {}))
    flushFrame()
    scheduler.schedule('b', mock(() => {}))
    expect(rafs).toHaveLength(1)
  })
})
