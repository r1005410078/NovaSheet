import { describe, expect, it, spyOn } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { ScenarioManifest } from '@novasheet/mbd'

import {
  computeScenarioCoverage,
  runScenarioCoverageCheck,
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
      // oxlint-disable-next-line unicorn/no-thenable -- BDD manifest schema requires a `then` field.
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
      // oxlint-disable-next-line unicorn/no-thenable -- BDD manifest schema requires a `then` field.
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

describe('runScenarioCoverageCheck', () => {
  it('returns 1 when failOnOrphans is enabled and orphan ids exist', async () => {
    const root = mkdtempSync(join(tmpdir(), 'scenario-coverage-'))
    const manifestPath = join(root, 'scenarios.manifest.json')
    const testsRoot = join(root, 'tests')
    const testFilePath = join(testsRoot, 'orphan.test.ts')

    const logSpy = spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {})

    try {
      mkdirSync(testsRoot, { recursive: true })

      writeFileSync(
        manifestPath,
        JSON.stringify({
          version: 1,
          generatedAt: '2026-06-10T00:00:00.000Z',
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
              sourceFile: 'L3a-default-mount.md',
              given: [],
              when: [],
              // oxlint-disable-next-line unicorn/no-thenable -- BDD manifest schema requires a `then` field.
              then: [],
            },
          ],
        }),
      )
      writeFileSync(
        testFilePath,
        "it('excel.L3b.orphan-case orphan id', () => {})\n",
      )

      const exitCode = await runScenarioCoverageCheck({
        manifestPath,
        testRoots: [testsRoot],
        failOnOrphans: true,
      })

      expect(exitCode).toBe(1)
    } finally {
      logSpy.mockRestore()
      warnSpy.mockRestore()
      errorSpy.mockRestore()
      rmSync(root, { recursive: true, force: true })
    }
  })
})
