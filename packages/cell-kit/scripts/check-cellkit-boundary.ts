import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface CellKitBoundaryViolation {
  readonly path: string
  readonly line: number
  readonly detail: string
}

const IMPORT_RE = /\bimport(?:\s+type)?[\s\S]*?\bfrom\s+['"]([^'"]+)['"]/g
/** core/canvas2d/react 三层禁止反向依赖 cell-kit（spec §4.4）。 */
const FORBIDDEN_IMPORTER = /\/packages\/(core|canvas2d|react)\/src\//
const CELLKIT_SPECIFIER = /^@zhiguang\/novasheet-cell-kit(\/|$)/

export function findCellKitBoundaryViolations(
  files: ReadonlyMap<string, string>,
): readonly CellKitBoundaryViolation[] {
  const violations: CellKitBoundaryViolation[] = []
  for (const [path, source] of files) {
    const norm = path.replace(/\\/g, '/')
    if (!FORBIDDEN_IMPORTER.test(norm)) continue
    for (const match of source.matchAll(IMPORT_RE)) {
      const specifier = match[1]
      if (!specifier || !CELLKIT_SPECIFIER.test(specifier)) continue
      violations.push({
        path: norm,
        line: lineForOffset(source, match.index ?? 0),
        detail: `cell-kit reverse-dependency: '${specifier}'`,
      })
    }
  }
  return violations
}

function lineForOffset(source: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset; i += 1) if (source.charCodeAt(i) === 10) line += 1
  return line
}

function readTree(dir: string): Map<string, string> {
  const files = new Map<string, string>()
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      for (const [p, s] of readTree(path)) files.set(p, s)
    } else if (entry.isFile() && (path.endsWith('.ts') || path.endsWith('.tsx'))) {
      files.set(path, readFileSync(path, 'utf8'))
    }
  }
  return files
}

export function runCellKitBoundaryCheck(repoRoot: string): number {
  const files = readTree(join(repoRoot, 'packages'))
  let failed = 0
  for (const v of findCellKitBoundaryViolations(files)) {
    console.error(`${v.path}:${v.line} ${v.detail}`)
    failed = 1
  }
  return failed
}

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
if ((import.meta as { main?: boolean }).main) {
  process.exit(runCellKitBoundaryCheck(REPO_ROOT))
}
