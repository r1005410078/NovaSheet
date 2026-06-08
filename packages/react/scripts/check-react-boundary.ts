import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

export type ReactLayer =
  | 'lib'
  | 'components'
  | 'feature-grid'
  | 'feature-toolbar'
  | 'excel'
  | 'index'

export interface ReactBoundaryViolation {
  readonly path: string
  readonly line: number
  readonly detail: string
}

const IMPORT_RE = /\bimport(?:\s+type)?[\s\S]*?\bfrom\s+['"]([^'"]+)['"]/g

const DEFAULT_SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

function srcRelativePath(filePath: string): string | null {
  const normalized = normalize(filePath).replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/src/')
  if (idx < 0) return null
  return normalized.slice(idx + 5)
}

function findSrcRootForFile(filePath: string): string | null {
  const normalized = normalize(filePath).replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/src/')
  if (idx < 0) return null
  return normalized.slice(0, idx + 4)
}

export function classifyReactLayer(filePath: string): ReactLayer | null {
  const rel = srcRelativePath(filePath)
  if (!rel) return null
  if (rel === 'index.ts') return 'index'
  if (rel.startsWith('lib/')) return 'lib'
  if (rel.startsWith('components/')) return 'components'
  if (rel.startsWith('features/grid')) return 'feature-grid'
  if (rel.startsWith('features/toolbar')) return 'feature-toolbar'
  if (rel.startsWith('excel/')) return 'excel'
  return null
}

export function resolveInternalImport(
  fromFile: string,
  specifier: string,
  srcRoot = DEFAULT_SRC_ROOT,
): string | null {
  if (specifier.startsWith('@/')) {
    const root = findSrcRootForFile(fromFile) ?? normalize(srcRoot)
    return normalize(join(root, specifier.slice(2)))
  }
  if (specifier.startsWith('.')) {
    return normalize(join(dirname(fromFile), specifier))
  }
  return null
}

function isFeatureIndexImport(specifier: string, feature: 'grid' | 'toolbar'): boolean {
  if (specifier === `@/features/${feature}`) return true
  if (specifier === `@/features/${feature}/index`) return true
  if (specifier.endsWith(`/features/${feature}`)) return true
  if (specifier.endsWith(`/features/${feature}/index`)) return true
  return false
}

export function findReactBoundaryViolations(
  files: ReadonlyMap<string, string>,
  srcRoot = DEFAULT_SRC_ROOT,
): readonly ReactBoundaryViolation[] {
  const violations: ReactBoundaryViolation[] = []

  for (const [path, source] of files) {
    const importerLayer = classifyReactLayer(path)
    if (!importerLayer) continue

    for (const match of source.matchAll(IMPORT_RE)) {
      const specifier = match[1]
      if (!specifier) continue

      const resolved = resolveInternalImport(path, specifier, srcRoot)
      if (!resolved) continue

      const importeeLayer = classifyReactLayer(resolved)
      if (!importeeLayer) continue

      const line = lineForOffset(source, match.index ?? 0)

      if (
        (importerLayer === 'feature-grid' && importeeLayer === 'feature-toolbar') ||
        (importerLayer === 'feature-toolbar' && importeeLayer === 'feature-grid')
      ) {
        violations.push({
          path,
          line,
          detail: `R1: cross-feature import '${specifier}'`,
        })
        continue
      }

      if (
        (importerLayer === 'feature-grid' || importerLayer === 'feature-toolbar') &&
        importeeLayer === 'excel'
      ) {
        violations.push({
          path,
          line,
          detail: `R2: feature imports excel layer '${specifier}'`,
        })
        continue
      }

      if (
        (importerLayer === 'lib' || importerLayer === 'components') &&
        (importeeLayer === 'feature-grid' ||
          importeeLayer === 'feature-toolbar' ||
          importeeLayer === 'excel')
      ) {
        violations.push({
          path,
          line,
          detail: `R3: shared layer imports '${specifier}'`,
        })
        continue
      }

      if (importerLayer === 'excel') {
        if (importeeLayer === 'feature-grid' && !isFeatureIndexImport(specifier, 'grid')) {
          violations.push({
            path,
            line,
            detail: `R4: excel must import grid via feature index, not '${specifier}'`,
          })
        }
        if (importeeLayer === 'feature-toolbar' && !isFeatureIndexImport(specifier, 'toolbar')) {
          violations.push({
            path,
            line,
            detail: `R4: excel must import toolbar via feature index, not '${specifier}'`,
          })
        }
      }
    }
  }

  return violations
}

export function runReactBoundaryCheck(root = DEFAULT_SRC_ROOT): number {
  const files = readTree(root)
  let failed = 0
  for (const v of findReactBoundaryViolations(files, root)) {
    console.error(`${v.path}:${v.line} ${v.detail}`)
    failed = 1
  }
  return failed
}

function lineForOffset(source: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset; i += 1) {
    if (source.charCodeAt(i) === 10) line += 1
  }
  return line
}

function readTree(dir: string): Map<string, string> {
  const files = new Map<string, string>()
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      for (const [childPath, source] of readTree(path)) files.set(childPath, source)
    } else if (entry.isFile() && (path.endsWith('.ts') || path.endsWith('.tsx'))) {
      files.set(path, readFileSync(path, 'utf8'))
    }
  }
  return files
}

if ((import.meta as { main?: boolean }).main) {
  process.exit(runReactBoundaryCheck())
}
