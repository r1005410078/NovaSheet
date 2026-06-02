import { describe, expect, it, mock } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import { registerWebDrag, WebGridRuntime } from '@novasheet/web'
import type { Drag, WebFrameSync, WebInteractionStatus } from '@novasheet/web'
import { makeEngine, makeHost, makeRenderer } from './helpers/runtime-fixtures'

interface FrameSyncSpy {
  attach: ReturnType<typeof mock>
  destroy: ReturnType<typeof mock>
  lastStatus: WebInteractionStatus | null
  syncCount: number
}

function makeFrameSyncDrag(spy: FrameSyncSpy): Drag & WebFrameSync {
  return {
    autoScrollAxis: null,
    get active() {
      return false
    },
    tryStart: () => false,
    move: () => false,
    commit: () => {},
    cancel: () => {},
    reevaluate: () => {},
    attach: spy.attach,
    syncFrame: (_frame, status: WebInteractionStatus) => {
      spy.lastStatus = status
      spy.syncCount += 1
    },
    destroy: spy.destroy,
  }
}

describe('WebGridRuntime frame-sync 基座', () => {
  it('attach/syncFrame/destroy 按生命周期被驱动', () => {
    const spy: FrameSyncSpy = {
      attach: mock(() => {}),
      destroy: mock(() => {}),
      lastStatus: null,
      syncCount: 0,
    }
    const ctx = createSheetContext()
    registerWebDrag(ctx, { id: 'probe', order: 1, create: () => makeFrameSyncDrag(spy) })

    const runtime = new WebGridRuntime({
      engine: makeEngine(),
      context: ctx,
      host: makeHost(),
      renderer: makeRenderer(),
    })

    expect(spy.attach).toHaveBeenCalledTimes(1)

    runtime.paintNow()
    expect(spy.syncCount).toBeGreaterThan(0)
    expect(spy.lastStatus).toMatchObject({ interacting: false, editing: false })

    runtime.destroy()
    expect(spy.destroy).toHaveBeenCalledTimes(1)
  })

  it('无 frame-sync contribution 时 flush 不 crash', () => {
    const ctx = createSheetContext()
    const runtime = new WebGridRuntime({
      engine: makeEngine(),
      context: ctx,
      host: makeHost(),
      renderer: makeRenderer(),
    })
    expect(() => runtime.paintNow()).not.toThrow()
    runtime.destroy()
  })
})
