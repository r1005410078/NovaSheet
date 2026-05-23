/**
 * @novasheet/web-canvas2d test bootstrap.
 * happy-dom + canvas stub: core setup runs first; we only install RecordingContext here
 * so painter/renderer tests get 2d without double-registering happy-dom.
 */

export {}

const { createRecordingContext } = await import('./helpers/recording-context')

if (typeof globalThis.Path2D === 'undefined') {
  // happy-dom 没有 Path2D；用最小 stub 顶替——painter 测试只会构造它并把它当 stroke()
  // 的参数透传到 RecordingContext，不会调用 arc/lineTo 等方法。`unknown` 转换是必要的，
  // 因为 stub 故意不实现完整 Path2D 接口（避免维护一堆死方法）。
  globalThis.Path2D = class Path2D {
    constructor(public readonly d?: string) {}
  } as unknown as typeof Path2D
}

HTMLCanvasElement.prototype.getContext = function getContext(
  this: HTMLCanvasElement,
  type: string,
) {
  if (type !== '2d') return null
  return createRecordingContext(this.width || 800, this.height || 600).ctx as never
} as never
