import { describe, expect, it, mock } from 'bun:test'
import { RenderFlushPipeline } from '../../../../src/dom/runtime/RenderFlushPipeline'
import type { RenderBackend } from '../../../../src/ports/RenderBackend'
import type { RuntimeRenderFrame } from '../../../../src/dom/runtime/runtime-frame'
import type { GridSelection } from '../../../../src/kernel/coords/SelectionTypes'
import type { ViewPipeline } from '../../../../src/features/view/ViewPipeline'

const emptySelection: GridSelection = {
  activeCell: null,
  anchorCell: null,
  extentCell: null,
  selectedRange: null,
}

describe('RenderFlushPipeline', () => {
  function make() {
    const order: string[] = []
    const frame = {
      selection: emptySelection,
      cellEdit: undefined,
    } as unknown as RuntimeRenderFrame
    const getFrame = mock(() => frame)
    const renderer = { render: mock(() => order.push('render')) } as unknown as RenderBackend
    const scheduled: (() => void)[] = []
    const pipeline = new RenderFlushPipeline({
      scheduler: { schedule: (_k, cb) => { scheduled.push(cb) }, cancel: () => {} },
      isDestroyed: () => false,
      getFrame,
      getRenderer: () => renderer,
      getViewPipeline: () => undefined,
      augmentFrame: (f) => f,
      syncSelectionOverlay: () => order.push('selection'),
      syncDomLayers: () => order.push('layers'),
      getOnSelectionChange: () => undefined,
      getSelection: () => emptySelection,
    })
    return { pipeline, scheduled, getFrame, order }
  }

  it('一次 flush 恰好一次 getFrame,顺序 render→selection→layers', () => {
    const { pipeline, scheduled, getFrame, order } = make()
    pipeline.invalidate()
    scheduled[0]!()
    expect(getFrame).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['render', 'selection', 'layers'])
  })

  it('paintSync 同步走完整帧且只调一次 getFrame', () => {
    const { pipeline, getFrame, order } = make()
    pipeline.paintSync()
    expect(getFrame).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['render', 'selection', 'layers'])
  })

  it('invalidate 已 destroy 时不 schedule', () => {
    const scheduled: (() => void)[] = []
    const getFrame = mock(
      () => ({ selection: emptySelection, cellEdit: undefined }) as unknown as RuntimeRenderFrame,
    )
    const pipeline = new RenderFlushPipeline({
      scheduler: { schedule: (_k, cb) => { scheduled.push(cb) }, cancel: () => {} },
      isDestroyed: () => true,
      getFrame,
      getRenderer: () => ({ render: mock(() => {}) }) as unknown as RenderBackend,
      getViewPipeline: () => undefined,
      augmentFrame: (f) => f,
      syncSelectionOverlay: () => {},
      syncDomLayers: () => {},
      getOnSelectionChange: () => undefined,
      getSelection: () => emptySelection,
    })
    pipeline.invalidate()
    expect(scheduled.length).toBe(0)
  })

  it('getRenderFrame 在 viewPipeline 存在时注入 viewPipeline 字段', () => {
    const frame = { selection: emptySelection, cellEdit: undefined } as unknown as RuntimeRenderFrame
    const viewPipeline = {} as unknown as ViewPipeline
    const pipeline = new RenderFlushPipeline({
      scheduler: { schedule: () => {}, cancel: () => {} },
      isDestroyed: () => false,
      getFrame: () => frame,
      getRenderer: () => ({ render: mock(() => {}) }) as unknown as RenderBackend,
      getViewPipeline: () => viewPipeline,
      augmentFrame: (f) => f,
      syncSelectionOverlay: () => {},
      syncDomLayers: () => {},
      getOnSelectionChange: () => undefined,
      getSelection: () => emptySelection,
    })
    const result = pipeline.getRenderFrame()
    expect((result as unknown as { viewPipeline: unknown }).viewPipeline).toBe(viewPipeline)
  })

  it('cancelPending 取消 pending flush，destroy 等价于再次 cancelPending', () => {
    const scheduled: (() => void)[] = []
    const cancel = mock((_k: string) => {})
    const getFrame = mock(
      () => ({ selection: emptySelection, cellEdit: undefined }) as unknown as RuntimeRenderFrame,
    )
    const pipeline = new RenderFlushPipeline({
      scheduler: { schedule: (_k, cb) => { scheduled.push(cb) }, cancel },
      isDestroyed: () => false,
      getFrame,
      getRenderer: () => ({ render: mock(() => {}) }) as unknown as RenderBackend,
      getViewPipeline: () => undefined,
      augmentFrame: (f) => f,
      syncSelectionOverlay: () => {},
      syncDomLayers: () => {},
      getOnSelectionChange: () => undefined,
      getSelection: () => emptySelection,
    })
    pipeline.cancelPending()
    expect(cancel).toHaveBeenCalledWith('renderer:flush')
    pipeline.destroy()
    expect(cancel).toHaveBeenCalledTimes(2)
  })
})
