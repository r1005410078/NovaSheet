/**
 * Vitest-style global stubbing for bun:test.
 *
 * Save → set → restore on `unstubAllGlobals()`. Tracks stubs in module-scope
 * Map so multiple calls in one test all roll back together — matches the
 * Vitest stubGlobal/unstubAllGlobals ergonomics that the tests were written against.
 *
 * Usage:
 *   import { stubGlobal, unstubAllGlobals } from '../helpers/global-stub'
 *   beforeEach(() => {})
 *   afterEach(() => unstubAllGlobals())
 *
 *   stubGlobal('devicePixelRatio', 2)
 *   // ... test ...
 */

type GlobalLike = Record<string, unknown>

const stubs = new Map<string, unknown>()

export function stubGlobal(name: string, value: unknown): void {
  if (!stubs.has(name)) {
    stubs.set(name, (globalThis as unknown as GlobalLike)[name])
  }
  ;(globalThis as unknown as GlobalLike)[name] = value
}

export function unstubAllGlobals(): void {
  for (const [name, original] of stubs) {
    if (original === undefined) {
      delete (globalThis as unknown as GlobalLike)[name]
    } else {
      ;(globalThis as unknown as GlobalLike)[name] = original
    }
  }
  stubs.clear()
}
