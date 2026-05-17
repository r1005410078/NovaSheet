/**
 * @novasheet/web-canvas2d test bootstrap.
 * happy-dom + canvas stub: core setup runs first; we only install RecordingContext here
 * so painter/renderer tests get 2d without double-registering happy-dom.
 */

const { createRecordingContext } = await import('./helpers/recording-context')

HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement, type: string) {
  if (type !== '2d') return null
  return createRecordingContext(this.width || 800, this.height || 600).ctx as never
} as never
