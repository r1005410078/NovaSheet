/**
 * Test environment bootstrap. Loaded once via bunfig.toml `[test] preload`
 * before any test file runs.
 *
 * Steps:
 *   1. Register happy-dom globally — installs document / window / HTMLElement /
 *      HTMLCanvasElement etc into the bun runtime. Vitest used to do this via
 *      `environment: 'happy-dom'` in vitest.config.ts.
 *   2. Stub HTMLCanvasElement.prototype.getContext('2d') to return our
 *      RecordingContext2D — happy-dom doesn't implement Canvas 2D, so without
 *      this stub `new Grid(el, ...)` would throw.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register()

// Import AFTER happy-dom registration so HTMLCanvasElement exists.
const { createRecordingContext } = await import('./helpers/recording-context')

HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement, type: string) {
  if (type !== '2d') return null
  return createRecordingContext(this.width || 800, this.height || 600).ctx as never
} as never
