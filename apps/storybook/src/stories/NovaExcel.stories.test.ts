import { describe, expect, it } from 'bun:test'
import { act } from 'react'

import { createRecordingContext } from '../../../../packages/canvas2d/tests/helpers/recording-context'
import { unmountReactStoryHosts } from '../react-story-host'
import { renderStoryHost, unmountReactRoot } from '../react-test-helpers'
import { CustomRowHeader, NovaExcelOutOfTheBox } from './NovaExcel.stories'

describe('NovaExcel Storybook stories', () => {
  it('renders NovaExcel with toolbar and sparse excel workspace', async () => {
    const render = NovaExcelOutOfTheBox.render
    expect(render).toBeDefined()

    const host = (await renderStoryHost(
      () => render!({}, {} as never) as HTMLElement,
    )) as HTMLElement & {
      __excelWorkspaceData: { getRowCount(): number; getSchema(): { fields: readonly unknown[] } }
    }

    expect(host.querySelector('[data-novasheet-react-excel]')).not.toBeNull()
    expect(host.querySelector('[data-novasheet-react-grid]')).not.toBeNull()
    expect(host.querySelector('[role="toolbar"]')).not.toBeNull()
    expect(host.querySelector('canvas')).not.toBeNull()
    expect(host.__excelWorkspaceData.getRowCount()).toBe(1_000)
    expect(host.__excelWorkspaceData.getSchema().fields).toHaveLength(26)

    unmountReactRoot((host as unknown as { __reactRoot: { unmount(): void } }).__reactRoot)
  })

  it('unmounts NovaExcel roots before Storybook clears its canvas', async () => {
    const render = NovaExcelOutOfTheBox.render
    expect(render).toBeDefined()

    const host = (await renderStoryHost(
      () => render!({}, {} as never) as HTMLElement,
    )) as HTMLElement & { __reactRoot: { unmount(): void } }
    const canvasElement = document.createElement('div')
    canvasElement.appendChild(host)

    expect(canvasElement.querySelector('[data-novasheet-react-grid]')).not.toBeNull()
    expect(canvasElement.querySelector('canvas')).not.toBeNull()

    act(() => {
      unmountReactStoryHosts(canvasElement)
    })

    expect(host.querySelector('[data-novasheet-react-grid]')).toBeNull()
    expect(host.querySelector('canvas')).toBeNull()
  })

  it('renders NovaExcel with device codes as custom row headers', async () => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame
    const rafQueue: FrameRequestCallback[] = []
    const recordings: Array<{
      readonly canvas: HTMLCanvasElement
      readonly recording: ReturnType<typeof createRecordingContext>
    }> = []
    let host: (HTMLElement & {
      __customRowHeaderData: {
        getCell(rowIndex: number, fieldId: string): unknown
        getSchema(): { fields: readonly { id: string }[] }
      }
      __reactRoot: { unmount(): void }
    }) | undefined

    try {
      globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
        rafQueue.push(callback)
        return rafQueue.length
      }
      HTMLCanvasElement.prototype.getContext = function getContext(
        this: HTMLCanvasElement,
        type: string,
      ) {
        if (type !== '2d') return null
        const recording = createRecordingContext(this.width || 800, this.height || 600)
        recordings.push({ canvas: this, recording })
        return recording.ctx as never
      } as never

      const render = CustomRowHeader.render
      expect(render).toBeDefined()
      const renderedHost = (await renderStoryHost(() => {
        const storyHost = render!({}, {} as never) as Exclude<typeof host, undefined>
        host = storyHost
        return storyHost
      })) as Exclude<typeof host, undefined>

      while (rafQueue.length > 0) {
        const callbacks = rafQueue.splice(0)
        for (const callback of callbacks) callback(performance.now())
      }

      expect(renderedHost.querySelector('[data-novasheet-react-excel]')).not.toBeNull()
      const gridRoot = renderedHost.querySelector('[data-novasheet-react-grid]')
      expect(gridRoot).not.toBeNull()
      const canvas = gridRoot!.querySelector<HTMLCanvasElement>('canvas')
      expect(canvas).not.toBeNull()
      expect(renderedHost.__customRowHeaderData.getCell(0, 'deviceCode')).toBe('设备-001')
      expect(renderedHost.__customRowHeaderData.getSchema().fields.map((field) => field.id)).toEqual([
        'name',
        'status',
      ])

      const visibleRecording = recordings.find((entry) => entry.canvas === canvas)?.recording
      expect(visibleRecording).toBeDefined()
      const texts = visibleRecording!.ops
        .filter((op) => op.op === 'fillText')
        .map((op) => (op.op === 'fillText' ? op.args[0] : ''))
      expect(texts).toContain('设备-001')
    } finally {
      try {
        try {
          if (host) unmountReactRoot(host.__reactRoot)
        } finally {
          HTMLCanvasElement.prototype.getContext = originalGetContext
        }
      } finally {
        globalThis.requestAnimationFrame = originalRequestAnimationFrame
      }
    }
  })
})
