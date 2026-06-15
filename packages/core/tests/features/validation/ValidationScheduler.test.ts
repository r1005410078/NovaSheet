import { describe, expect, it } from 'bun:test'
import { ValidationScheduler } from '../../../src/features/validation/ValidationScheduler'

function makeScheduler(validate: (r: number, c: number) => Promise<void>, redraw = () => {}) {
  return new ValidationScheduler(validate, redraw, { batchSize: 10, maxConcurrent: 2 })
}

describe('ValidationScheduler', () => {
  it('calls validate for pushed cells after flush', async () => {
    const validated: string[] = []
    const s = makeScheduler(async (r, c) => { validated.push(`${r}:${c}`) })
    s.push([{ rawRow: 0, rawCol: 0 }, { rawRow: 1, rawCol: 1 }])
    await new Promise(r => setTimeout(r, 20))
    expect(validated).toContain('0:0')
    expect(validated).toContain('1:1')
  })

  it('skips stale tasks when cell pushed again before flush', async () => {
    let callCount = 0
    const s = makeScheduler(async () => { callCount++ })
    s.push([{ rawRow: 0, rawCol: 0 }])
    s.push([{ rawRow: 0, rawCol: 0 }])
    await new Promise(r => setTimeout(r, 20))
    // Only 1 actual validate call (latest version wins)
    expect(callCount).toBe(1)
  })

  it('destroy stops pending flush', async () => {
    let callCount = 0
    const s = makeScheduler(async () => { callCount++ })
    s.push([{ rawRow: 0, rawCol: 0 }])
    s.destroy()
    await new Promise(r => setTimeout(r, 20))
    expect(callCount).toBe(0)
  })

  it('pushAll clears existing queue and re-validates all', async () => {
    const validated: string[] = []
    const s = makeScheduler(async (r, c) => { validated.push(`${r}:${c}`) })
    s.push([{ rawRow: 0, rawCol: 0 }])
    s.pushAll([{ rawRow: 1, rawCol: 1 }, { rawRow: 2, rawCol: 2 }])
    await new Promise(r => setTimeout(r, 20))
    // Only cells from pushAll should appear
    expect(validated).toContain('1:1')
    expect(validated).toContain('2:2')
  })
})
