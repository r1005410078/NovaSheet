import { describe, expect, it } from 'bun:test'
import type { ScenarioManifest } from '@novasheet/mbd'

import {
  computeScenarioCoverage,
  scanScenarioIdsFromSource,
} from '../../scripts/check-scenario-coverage'

const manifest: ScenarioManifest = {
  version: 1,
  generatedAt: '2026-06-09T00:00:00.000Z',
  source: 'scenarios/**/*.md',
  titleConvention: {
    description: 'test',
    idPattern: '^excel\\.L3[abc]\\.[a-z0-9-]+$',
    examples: [],
  },
  scenarios: [
    {
      id: 'excel.L3a.default-mount',
      layer: 'L3a',
      summary: 'mount',
      tags: [],
      sourceFile: 'a.md',
      given: [],
      when: [],
      then: [],
    },
    {
      id: 'excel.L3b.undo-redo',
      layer: 'L3b',
      summary: 'undo',
      tags: [],
      sourceFile: 'b.md',
      given: [],
      when: [],
      then: [],
    },
  ],
}

describe('scanScenarioIdsFromSource', () => {
  it('extracts scenario ids from it / it.todo / it.skip titles', () => {
    const source = `
      it('excel.L3a.default-mount renders shell', () => {})
      it.todo('excel.L3b.undo-redo wiring')
      it.skip("excel.L3c.fill-reflects-toolbar toolbar state")
    `

    expect(scanScenarioIdsFromSource(source).sort()).toEqual([
      'excel.L3a.default-mount',
      'excel.L3b.undo-redo',
      'excel.L3c.fill-reflects-toolbar',
    ])
  })

  it('ignores titles that do not start with scenario id', () => {
    const source = `it('renders toolbar', () => {})`
    expect(scanScenarioIdsFromSource(source)).toEqual([])
  })
})

describe('computeScenarioCoverage', () => {
  it('computes covered, missing, orphan, and byLayer stats', () => {
    const report = computeScenarioCoverage(manifest, [
      'excel.L3a.default-mount',
      'excel.L3b.undo-redo',
      'excel.L3z.orphan-case',
    ])

    expect(report.covered).toEqual(['excel.L3a.default-mount', 'excel.L3b.undo-redo'])
    expect(report.missing).toEqual([])
    expect(report.orphan).toEqual(['excel.L3z.orphan-case'])
    expect(report.structuralRate).toBe(1)
    expect(report.byLayer.L3a).toEqual({ expected: 1, covered: 1 })
    expect(report.byLayer.L3b).toEqual({ expected: 1, covered: 1 })
  })

  it('reports missing manifest scenarios', () => {
    const report = computeScenarioCoverage(manifest, ['excel.L3a.default-mount'])

    expect(report.missing).toEqual(['excel.L3b.undo-redo'])
    expect(report.structuralRate).toBe(0.5)
  })
})
