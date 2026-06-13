import { describe, expect, it } from 'bun:test'
import type { ScenarioEntry } from '../../src/types'
import { validateScenarios } from '../../src/validate/validate'

function entry(overrides: Partial<ScenarioEntry> & Pick<ScenarioEntry, 'id' | 'layer' | 'summary'>): ScenarioEntry {
  return {
    tags: [],
    filePath: 'scenarios/sample.md',
    given: [],
    when: [],
    // oxlint-disable-next-line unicorn/no-thenable -- BDD manifest schema requires a `then` field.
    then: [],
    ...overrides,
  }
}

describe('validateScenarios', () => {
  it('returns no errors for valid scenarios', () => {
    const errors = validateScenarios([
      entry({ id: 'excel.L3a.default-mount', layer: 'L3a', summary: 'mount' }),
      entry({ id: 'excel.L3b.undo-redo', layer: 'L3b', summary: 'undo' }),
    ])

    expect(errors).toEqual([])
  })

  it('reports duplicate ids', () => {
    const errors = validateScenarios([
      entry({ id: 'excel.L3a.default-mount', layer: 'L3a', summary: 'a', filePath: 'a.md' }),
      entry({ id: 'excel.L3a.default-mount', layer: 'L3a', summary: 'b', filePath: 'b.md' }),
    ])

    expect(errors.some((e) => e.message.includes('duplicate id'))).toBe(true)
  })

  it('reports invalid id pattern', () => {
    const errors = validateScenarios([
      entry({ id: 'bad-id', layer: 'L3a', summary: 'x' }),
    ])

    expect(errors.some((e) => e.message.includes('id'))).toBe(true)
  })

  it('reports layer mismatch with id prefix', () => {
    const errors = validateScenarios([
      entry({ id: 'excel.L3b.undo-redo', layer: 'L3a', summary: 'x' }),
    ])

    expect(errors.some((e) => e.message.includes('layer'))).toBe(true)
  })

  it('reports empty summary', () => {
    const errors = validateScenarios([
      entry({ id: 'excel.L3a.default-mount', layer: 'L3a', summary: '   ' }),
    ])

    expect(errors.some((e) => e.message.includes('summary'))).toBe(true)
  })
})
