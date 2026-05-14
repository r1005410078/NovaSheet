import { beforeAll } from 'vitest'
import { createRecordingContext } from './helpers/recording-context'

beforeAll(() => {
  // happy-dom stub: HTMLCanvasElement.getContext returns null by default
  HTMLCanvasElement.prototype.getContext = function getContext(
    this: HTMLCanvasElement,
    type: string,
  ) {
    if (type !== '2d') return null
    return createRecordingContext(this.width || 800, this.height || 600).ctx as never
  } as never
})
