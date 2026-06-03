import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import { WebGridRuntime } from '../../src/runtime/WebGridRuntime'
import { makeEngine, makeHost, makeRenderer } from './helpers/runtime-fixtures'

describe('WebGridRuntime × context-menu — 未安装 feature', () => {
  it('handleHostContextMenu 无 controller 时不抛错', () => {
    const ctx = createSheetContext()
    const runtime = new WebGridRuntime({
      engine: makeEngine(),
      context: ctx,
      host: makeHost(),
      renderer: makeRenderer(),
    })
    expect(() =>
      runtime.handleHostContextMenu({ x: 50, y: 60, shiftKey: false, clientX: 50, clientY: 60 }),
    ).not.toThrow()
    runtime.destroy()
  })
})
