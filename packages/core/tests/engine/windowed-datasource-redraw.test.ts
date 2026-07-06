/**
 * Finding 1 integration proof (2026-07-05 windowed-data-source review, task 9):
 * drives a real `Grid` (DefaultGridEngine + GridRuntime + a recording RenderBackend) with a
 * real `WindowedDataSource` as `data`, and proves a repaint happens with **zero further user
 * interaction** after mount — no additional hintWindow/scroll call from the test itself.
 *
 * Not placed under `tests/acceptance/e2e/grid/` — that directory is BDD-scenario-gated
 * (`bdd.test.ts` expects a corresponding `scenarios/*.md`), and this proof was dispatched as an
 * ad-hoc review-fix requirement, not through the BDD gate. Living here alongside
 * `DefaultGridEngine.hintWindow.test.ts` (Task 8's redraw-adjacent wiring test) instead. Flag
 * for a human: consider promoting to a proper `windowed-push-update`-style L2 scenario later.
 *
 * RAF control: `GridRuntime.invalidate()` schedules through `FrameScheduler` (real
 * `requestAnimationFrame`), including the very first paint after mount (`scheduleHostResize`).
 * `withManualRaf` (tests/acceptance/_helpers/fixtures.ts) can't be used here because its
 * try/finally restores the global synchronously right after the callback *returns* — for an
 * async callback that returns a pending Promise, that happens before our `await tick()`
 * resumes, silently swapping back to the real RAF mid-test. Using `stubGlobal` directly keeps
 * the mock alive for the whole async test body.
 */
import { afterEach, describe, expect, it } from 'bun:test'
import { Grid, WindowedDataSource, type Row, type Schema } from '../../src'
import { createFakeWindowedProvider } from '../kernel/data/windowed/fakeProvider'
import { createRecordingBackend } from '../acceptance/_helpers/fixtures'
import { stubGlobal, unstubAllGlobals } from '../helpers/global-stub'

const schema: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 100 },
    { id: 'score', name: 'Score', type: 'number', width: 80 },
  ],
}

function installManualRaf(): { flush: () => void } {
  const callbacks: FrameRequestCallback[] = []
  stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback): number => {
    callbacks.push(cb)
    return callbacks.length
  }) as typeof requestAnimationFrame)
  return {
    flush: () => {
      // Snapshot-then-clear (mirrors FrameScheduler.flush): a task run during flush may itself
      // schedule a new RAF (e.g. invalidate() re-entering), which must land in a *later* flush.
      const pending = callbacks.splice(0, callbacks.length)
      for (const cb of pending) cb(0)
    },
  }
}

async function tick(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => queueMicrotask(() => resolve(undefined)))
}

function mountWindowedGrid() {
  const fake = createFakeWindowedProvider()
  const data = new WindowedDataSource({ schema, rowCount: 1000, provider: fake.provider })
  const { backend, recorder } = createRecordingBackend()
  const container = document.createElement('div')
  Object.assign(container.style, { width: '400px', height: '300px' })
  document.body.appendChild(container)
  const grid = new Grid(container, { data, backend })
  return { fake, data, grid, recorder, container }
}

describe('WindowedDataSource → Grid repaint bridge (Finding 1 integration proof)', () => {
  afterEach(() => unstubAllGlobals())

  it('a background loadRange resolve repaints the grid with zero further interaction', async () => {
    const raf = installManualRaf()
    const { fake, data, grid, recorder, container } = mountWindowedGrid()

    // Initial mount schedules the first host-resize/paint via RAF (scheduleHostResize) —
    // flushing it is the test harness pumping the render loop, not a user interaction. That
    // first paintSync() calls engine.getFrame(), which per Task 8's wiring calls
    // data.hintWindow?.() on its own — we never call hintWindow ourselves.
    raf.flush()
    expect(recorder.frames.length).toBeGreaterThan(0)
    expect(fake.pendingLoads().length).toBeGreaterThan(0)

    const framesBeforeResolve = recorder.frames.length
    const [load] = fake.pendingLoads()
    const rowSpan = load!.window.endRow - load!.window.startRow + 1
    load!.resolve({
      rows: Array.from({ length: rowSpan }, (_, i) => ({ name: `n${i}`, score: i })) satisfies Row[],
    })

    // WindowedDataSource.emitRowsChanged flushes on a microtask; no scroll/hintWindow call here.
    await tick()
    // The dataChangeRedrawCallback → GridRuntime.invalidate() path schedules a NEW RAF task —
    // flushing it is still just the harness pumping the loop, triggered by nothing but the
    // resolve above.
    raf.flush()

    expect(recorder.frames.length).toBeGreaterThan(framesBeforeResolve)

    grid.destroy()
    data.dispose()
    document.body.removeChild(container)
  })

  it('a rowCountChanged push (epoch shrink) repaints via axis rebuild with zero further interaction', async () => {
    const raf = installManualRaf()
    const { fake, data, grid, recorder, container } = mountWindowedGrid()

    raf.flush()
    expect(recorder.frames.length).toBeGreaterThan(0)
    expect(data.getRowCount()).toBe(1000)

    const framesBeforeShrink = recorder.frames.length
    // Server-pushed rowCount notification — no loadRange involved, no test-side hintWindow call.
    fake.emit({ type: 'rowCount', rowCount: 400 })

    // WindowedDataSource.handleRowCountEvent emits rowCountChanged synchronously, but
    // DefaultGridEngine's rebuildData (needed to re-derive the row axis — see
    // DefaultGridEngine.scheduleDataRebuild) is deliberately deferred to a microtask: running it
    // synchronously, nested inside this event's dispatch through the SortLayer/FilterLayer/
    // HideRowsLayer forwarding chain, would re-subscribe a new listener onto a Set those layers
    // are still live-iterating over — an infinite reentrant loop this test caught during
    // development. await tick() lets that deferred rebuild actually run before we assert.
    await tick()
    raf.flush()

    expect(data.getRowCount()).toBe(400)
    expect(recorder.frames.length).toBeGreaterThan(framesBeforeShrink)

    grid.destroy()
    data.dispose()
    document.body.removeChild(container)
  })
})
