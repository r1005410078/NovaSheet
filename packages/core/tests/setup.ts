/**
 * Test environment bootstrap for @zhiguang/core tests.
 * happy-dom only — canvas stub lives in @zhiguang/canvas2d/tests/setup.ts.
 */

import { afterEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register()

/** Injected <style> ids from dom/host helpers — cleared so parallel files do not share state. */
const NOVASHEET_STYLE_IDS = [
  'novasheet-cell-editor-style',
  'novasheet-resize-handle-style',
  'novasheet-scrollbar-style',
  'novasheet-filter-popover-style',
  'novasheet-context-menu-style',
] as const

afterEach(() => {
  document.body.replaceChildren()
  for (const id of NOVASHEET_STYLE_IDS) {
    document.getElementById(id)?.remove()
  }
})
