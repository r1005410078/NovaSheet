import type { SheetContext } from '@novasheet/core'

/** Install built-in NovaSheet capabilities for the default sheet assembly. */
export function installDefaultExtensions(_ctx: SheetContext): void {
  // Default capabilities still live in the existing Grid assembly during the package split.
}
