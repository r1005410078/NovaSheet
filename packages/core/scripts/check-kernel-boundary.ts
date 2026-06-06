import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface KernelFeatureImport {
  readonly path: string
  readonly line: number
  readonly importPath: string
}

const IMPORT_RE = /\bimport(?:\s+type)?[\s\S]*?\bfrom\s+['"]([^'"]*features\/[^'"]*)['"]/g

export function findKernelFeatureImports(files: ReadonlyMap<string, string>): readonly KernelFeatureImport[] {
  const violations: KernelFeatureImport[] = []
  for (const [path, source] of files) {
    if (!path.includes('/kernel/') || !path.endsWith('.ts')) continue
    for (const match of source.matchAll(IMPORT_RE)) {
      const importPath = match[1]
      if (!importPath) continue
      violations.push({
        path,
        line: lineForOffset(source, match.index ?? 0),
        importPath,
      })
    }
  }
  return violations
}

export function runKernelBoundaryCheck(root = 'packages/core/src/kernel'): number {
  const violations = findKernelFeatureImports(readTree(root))
  if (violations.length === 0) return 0
  for (const violation of violations) {
    console.error(`${violation.path}:${violation.line} imports ${violation.importPath}`)
  }
  return 1
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
    } else if (entry.isFile() && path.endsWith('.ts')) {
      files.set(path, readFileSync(path, 'utf8'))
    }
  }
  return files
}
