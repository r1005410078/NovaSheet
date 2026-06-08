import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import type { ScenarioEntry, ScenarioStatus } from '../types'
import { parseFrontmatterYaml, splitFrontmatter } from './frontmatter'
import { parseSections } from './sections'

const LAYER_FROM_ID_RE = /^excel\.(L3[abc])\./

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`frontmatter field "${field}" must be a non-empty string`)
  }
  return value.trim()
}

function asOptionalStatus(value: unknown): ScenarioStatus | undefined {
  if (value === undefined) return undefined
  if (value === 'draft' || value === 'implemented') return value
  throw new Error('frontmatter field "status" must be "draft" or "implemented"')
}

function asTags(value: unknown): readonly string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error('frontmatter field "tags" must be a string array')
  }
  return value
}

/** Parse a single scenario markdown file into a ScenarioEntry. */
export function parseScenarioFile(
  absolutePath: string,
  rootDir?: string,
): ScenarioEntry {
  const content = readFileSync(absolutePath, 'utf8')
  const { frontmatter, body } = splitFrontmatter(content)
  const data = parseFrontmatterYaml(frontmatter)
  const sections = parseSections(body)

  const filePath =
    rootDir !== undefined
      ? relative(rootDir, absolutePath).replace(/\\/g, '/')
      : absolutePath.replace(/\\/g, '/')

  return {
    id: asString(data.id, 'id'),
    layer: asString(data.layer, 'layer'),
    summary: asString(data.summary, 'summary'),
    userStory: sections.userStory,
    tags: asTags(data.tags),
    status: asOptionalStatus(data.status),
    filePath,
    given: sections.given,
    when: sections.when,
    then: sections.then,
  }
}

function globPatternToScanDir(globPattern: string, rootDir: string): { scanDir: string; pattern: string } {
  const normalized = globPattern.replace(/\\/g, '/')
  const starIdx = normalized.search(/[*?[{]/)
  const base = starIdx >= 0 ? normalized.slice(0, starIdx) : normalized
  const lastSlash = base.lastIndexOf('/')
  const scanDir = lastSlash >= 0 ? resolve(rootDir, base.slice(0, lastSlash)) : rootDir
  const pattern =
    lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized
  return { scanDir, pattern: pattern.length > 0 ? pattern : '*' }
}

/** Glob and parse scenario markdown files under rootDir. */
export async function parseScenarioFiles(
  globPattern: string,
  rootDir: string,
): Promise<ScenarioEntry[]> {
  const { scanDir, pattern } = globPatternToScanDir(globPattern, rootDir)
  const glob = new Bun.Glob(pattern)
  const entries: ScenarioEntry[] = []

  for await (const relativePath of glob.scan({ cwd: scanDir, onlyFiles: true })) {
    if (!relativePath.endsWith('.md')) continue
    const baseName = relativePath.split('/').pop() ?? relativePath
    // Underscore-prefixed files (e.g. _template.md) are author aids, not scenarios.
    if (baseName.startsWith('_')) continue
    const absolutePath = resolve(scanDir, relativePath)
    entries.push(parseScenarioFile(absolutePath, rootDir))
  }

  return entries.sort((a, b) => a.id.localeCompare(b.id))
}

/** Layer prefix embedded in scenario id, e.g. L3b from excel.L3b.undo-redo. */
export function layerFromId(id: string): string | undefined {
  const match = LAYER_FROM_ID_RE.exec(id)
  return match?.[1]
}
