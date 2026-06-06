import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface KernelFeatureImport {
  readonly path: string
  readonly line: number
  readonly importPath: string
}

/** core 内部边界违规：纯层依赖 DOM 壳，或纯层直接触碰 DOM 全局。 */
export interface BoundaryViolation {
  readonly path: string
  readonly line: number
  readonly detail: string
}

const FEATURE_IMPORT_RE =
  /\bimport(?:\s+type)?[\s\S]*?\bfrom\s+['"]([^'"]*features\/[^'"]*)['"]/g
const DOM_IMPORT_RE = /\bimport(?:\s+type)?[\s\S]*?\bfrom\s+['"]([^'"]*\bdom\/[^'"]*)['"]/g
const DOM_GLOBAL_RE = /\b(?:document|window)\s*\./g

/** 纯层目录（零 DOM、可 node/worker、脱 DOM 测）。`ports/` 是边界契约层，可引用 DOM 类型但不依赖 `dom/`。 */
const PURE_DIRS = ['/kernel/', '/features/', '/engine/', '/ports/']

export function findKernelFeatureImports(
  files: ReadonlyMap<string, string>,
): readonly KernelFeatureImport[] {
  const violations: KernelFeatureImport[] = []
  for (const [path, source] of files) {
    if (!path.includes('/kernel/') || !path.endsWith('.ts')) continue
    for (const match of source.matchAll(FEATURE_IMPORT_RE)) {
      const importPath = match[1]
      if (!importPath) continue
      violations.push({ path, line: lineForOffset(source, match.index ?? 0), importPath })
    }
  }
  return violations
}

/**
 * 纯层（kernel/features/engine/ports）不得依赖 DOM 壳 `dom/**`；kernel/features/engine
 * 不得触碰 `document.` / `window.` 全局（ports 可引用 HTMLElement 等 DOM 类型作边界契约，
 * 但不触碰运行时全局）。这条把 web-into-core 后「纯层 ↔ DOM 壳」的单向依赖钉死。
 */
export function findPureLayerDomViolations(
  files: ReadonlyMap<string, string>,
): readonly BoundaryViolation[] {
  const violations: BoundaryViolation[] = []
  for (const [path, source] of files) {
    if (!path.endsWith('.ts')) continue
    if (!PURE_DIRS.some((dir) => path.includes(dir))) continue
    for (const match of source.matchAll(DOM_IMPORT_RE)) {
      violations.push({
        path,
        line: lineForOffset(source, match.index ?? 0),
        detail: `imports DOM shell '${match[1]}'（纯层禁依赖 dom/**）`,
      })
    }
    // ports 是边界契约层，允许 DOM 类型；DOM 全局只对 kernel/features/engine 禁。
    if (path.includes('/ports/')) continue
    for (const match of source.matchAll(DOM_GLOBAL_RE)) {
      violations.push({
        path,
        line: lineForOffset(source, match.index ?? 0),
        detail: `touches DOM global '${match[0]}'（纯层禁触碰 document/window）`,
      })
    }
  }
  return violations
}

export function runKernelBoundaryCheck(root = 'packages/core/src'): number {
  const files = readTree(root)
  let failed = 0
  for (const v of findKernelFeatureImports(files)) {
    console.error(`${v.path}:${v.line} imports ${v.importPath}`)
    failed = 1
  }
  for (const v of findPureLayerDomViolations(files)) {
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
    } else if (entry.isFile() && path.endsWith('.ts')) {
      files.set(path, readFileSync(path, 'utf8'))
    }
  }
  return files
}
