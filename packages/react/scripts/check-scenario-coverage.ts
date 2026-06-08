import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readManifest } from '@novasheet/mbd'
import type { ScenarioManifest } from '@novasheet/mbd'

const SCENARIO_ID_RE = /\bit(?:\.todo|\.skip)?\(\s*['"](excel\.L3[abc]\.[a-z0-9-]+)/g

export interface LayerCoverage {
  readonly expected: number
  readonly covered: number
}

export interface ScenarioCoverageReport {
  readonly expectedIds: readonly string[]
  readonly foundIds: readonly string[]
  readonly covered: readonly string[]
  readonly missing: readonly string[]
  readonly orphan: readonly string[]
  readonly byLayer: Readonly<Record<string, LayerCoverage>>
  readonly structuralRate: number
}

export interface ScenarioCoverageOptions {
  readonly manifestPath: string
  readonly testRoots: readonly string[]
  readonly failOnMissing?: boolean
  readonly warnOrphans?: boolean
}

/** Scan a test source string for scenario ids in bun:test titles. */
export function scanScenarioIdsFromSource(source: string): string[] {
  const found = new Set<string>()
  for (const match of source.matchAll(SCENARIO_ID_RE)) {
    const id = match[1]
    if (id !== undefined) found.add(id)
  }
  return [...found]
}

/** Compare manifest expected ids with discovered test ids. */
export function computeScenarioCoverage(
  manifest: ScenarioManifest,
  foundIds: readonly string[],
): ScenarioCoverageReport {
  const expectedIds = manifest.scenarios.map((scenario) => scenario.id)
  const expectedSet = new Set(expectedIds)
  const foundSet = new Set(foundIds)

  const covered = expectedIds.filter((id) => foundSet.has(id))
  const missing = expectedIds.filter((id) => !foundSet.has(id))
  const orphan = [...foundSet].filter((id) => !expectedSet.has(id)).sort()

  const byLayer: Record<string, { expected: number; covered: number }> = {}
  for (const scenario of manifest.scenarios) {
    const layer = byLayer[scenario.layer] ?? { expected: 0, covered: 0 }
    byLayer[scenario.layer] = {
      expected: layer.expected + 1,
      covered: layer.covered + (foundSet.has(scenario.id) ? 1 : 0),
    }
  }

  const structuralRate =
    expectedIds.length === 0 ? 1 : covered.length / expectedIds.length

  return {
    expectedIds,
    foundIds: [...foundSet].sort(),
    covered,
    missing,
    orphan,
    byLayer,
    structuralRate,
  }
}

function readTestTree(dir: string): Map<string, string> {
  const files = new Map<string, string>()
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      for (const [childPath, source] of readTestTree(path)) files.set(childPath, source)
    } else if (entry.isFile() && /\.test\.tsx?$/.test(entry.name)) {
      files.set(path, readFileSync(path, 'utf8'))
    }
  }
  return files
}

function collectFoundIds(testRoots: readonly string[]): string[] {
  const found = new Set<string>()
  for (const root of testRoots) {
    for (const source of readTestTree(root).values()) {
      for (const id of scanScenarioIdsFromSource(source)) found.add(id)
    }
  }
  return [...found]
}

function formatReport(report: ScenarioCoverageReport): string {
  const lines = [
    `scenario coverage: ${report.covered.length}/${report.expectedIds.length} (${(report.structuralRate * 100).toFixed(1)}%)`,
  ]

  for (const [layer, stats] of Object.entries(report.byLayer).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`  ${layer}: ${stats.covered}/${stats.expected}`)
  }

  if (report.missing.length > 0) {
    lines.push('missing:')
    for (const id of report.missing) lines.push(`  - ${id}`)
  }

  if (report.orphan.length > 0) {
    lines.push('orphan:')
    for (const id of report.orphan) lines.push(`  - ${id}`)
  }

  return lines.join('\n')
}

/** Run scenario coverage check; returns process exit code. */
export async function runScenarioCoverageCheck(
  options: ScenarioCoverageOptions,
): Promise<number> {
  const manifest = await readManifest(resolve(options.manifestPath))
  const foundIds = collectFoundIds(options.testRoots.map((root) => resolve(root)))
  const report = computeScenarioCoverage(manifest, foundIds)

  console.log(formatReport(report))

  const warnOrphans = options.warnOrphans ?? true
  if (warnOrphans && report.orphan.length > 0) {
    console.warn(`warning: ${report.orphan.length} orphan scenario id(s) in tests`)
  }

  if (report.missing.length > 0) {
    const message = `${report.missing.length} manifest scenario(s) lack matching test titles`
    if (options.failOnMissing) {
      console.error(message)
      return 1
    }
    console.warn(`warning: ${message}`)
  }

  return options.failOnMissing === true && report.missing.length > 0 ? 1 : 0
}

function packageRoot(): string {
  return resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
}

if ((import.meta as { main?: boolean }).main) {
  const root = packageRoot()
  const failOnMissing = process.argv.includes('--fail-on-missing')
  const code = await runScenarioCoverageCheck({
    manifestPath: join(root, 'tests/excel/scenarios.manifest.json'),
    testRoots: [join(root, 'tests/excel')],
    failOnMissing,
  })
  process.exit(code)
}
