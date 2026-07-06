/**
 * Regression suite for the deferred rowCountChanged/reset rebuild bridge
 * (`DefaultGridEngine.scheduleDataRebuild`, added by c95154f for WindowedDataSource, guarded here
 * against clobbering state already handled by a synchronous command handler — see
 * `.superpowers/sdd/task-9-report.md` follow-up section).
 *
 * `InMemoryDataSource.insertRows`/`deleteRows`/`setRows` all emit `rowCountChanged`/`reset`
 * synchronously as part of the engine's own `InsertRowsCommandHandler`/`DeleteRowsCommandHandler`
 * call path — which ALSO, in the very same synchronous call, updates `rowStructure.rawRowsAxis`
 * (preserving custom row heights) and `layout.rebuildRows()` (preserving scroll via
 * `recreateViewportPreserving()`). The deferred `scheduleDataRebuild` microtask must not then
 * blow that away with a from-scratch `rebuildData()` (default heights, non-preserving
 * `layout.initView()`) just because the bridging event happened to fire too.
 */
import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine, InMemoryDataSource, denseGridTheme, type Row, type Schema } from '../../src'

const schema: Schema = {
  fields: [{ id: 'a', name: 'A', type: 'text', width: 100 }],
}

function makeData(rowCount: number): InMemoryDataSource {
  return new InMemoryDataSource({
    schema,
    rows: Array.from({ length: rowCount }, (_, i) => ({ a: `r${i}` })) satisfies Row[],
  })
}

async function tick(): Promise<void> {
  await new Promise<void>((resolve) => queueMicrotask(() => resolve()))
}

describe('DefaultGridEngine — deferred rebuild does not clobber synchronously-handled row structure changes', () => {
  it('an unrelated deleteRows leaves a custom row height untouched after the deferred microtask runs', async () => {
    const engine = new DefaultGridEngine({ data: makeData(10), theme: denseGridTheme })
    engine.setRowHeight(0, 99)
    expect(engine.getRowHeight(0)).toBe(99)

    engine.deleteRows([5]) // unrelated row; command handler already reconciled rawRowsAxis
    await tick()

    expect(engine.getRowHeight(0)).toBe(99)
  })

  it('an unrelated insertRows leaves a custom row height untouched after the deferred microtask runs', async () => {
    const engine = new DefaultGridEngine({ data: makeData(10), theme: denseGridTheme })
    engine.setRowHeight(0, 77)
    expect(engine.getRowHeight(0)).toBe(77)

    engine.insertRows(5, 1) // unrelated position
    await tick()

    expect(engine.getRowHeight(0)).toBe(77)
  })

  it('an unrelated deleteRows leaves scroll position untouched after the deferred microtask runs', async () => {
    const engine = new DefaultGridEngine({ data: makeData(10), theme: denseGridTheme })
    engine.setViewportSize(300, 400)
    engine.setScroll(0, 42)
    expect(engine.getViewport().snapshot().scrollY).toBe(42)

    engine.deleteRows([5])
    await tick()

    expect(engine.getViewport().snapshot().scrollY).toBe(42)
  })

  it('an unrelated insertRows leaves scroll position untouched after the deferred microtask runs', async () => {
    const engine = new DefaultGridEngine({ data: makeData(10), theme: denseGridTheme })
    engine.setViewportSize(300, 400)
    engine.setScroll(0, 42)

    engine.insertRows(5, 1)
    await tick()

    expect(engine.getViewport().snapshot().scrollY).toBe(42)
  })

  it('a genuinely out-of-band setRows (no synchronous engine command handler) still rebuilds and redraws', async () => {
    const data = makeData(10)
    const engine = new DefaultGridEngine({ data, theme: denseGridTheme })
    let redraws = 0
    engine.setDataChangeRedrawCallback(() => {
      redraws += 1
    })
    engine.setRowHeight(0, 99)

    // data.setRows() is a direct mutation on the underlying DataSource, bypassing every engine
    // command handler entirely — mirrors WindowedDataSource applying an out-of-band epoch/rowCount
    // change with nothing else on the engine's call stack. Nothing synchronously reconciles
    // rowStructure's rawRowsAxis here, so the deferred rebuild's count comparison must detect the
    // real drift and still do the (destructive, but correct/accepted-tradeoff) full rebuild.
    data.setRows(Array.from({ length: 6 }, (_, i) => ({ a: `x${i}` })) satisfies Row[])
    expect(redraws).toBe(0) // still deferred to a microtask — not yet fired synchronously

    await tick()

    expect(engine.getData().getRowCount()).toBe(6)
    expect(redraws).toBeGreaterThan(0)
    // Documented accepted trade-off (see scheduleDataRebuild comment): a genuine out-of-band
    // structural drift with no synchronous handler still resets custom row heights, because
    // rebuildData() reconstructs rawRowsAxis from scratch with default heights.
    expect(engine.getRowHeight(0)).toBe(denseGridTheme.metrics.rowHeight)
  })
})

describe('DefaultGridEngine.dispose — unsubscribes from the data source', () => {
  it('after dispose(), emitting an event on the (still-referenced) data source no longer triggers a redraw', async () => {
    const data = makeData(10)
    const engine = new DefaultGridEngine({ data, theme: denseGridTheme })
    let redraws = 0
    engine.setDataChangeRedrawCallback(() => {
      redraws += 1
    })

    // Sanity: before dispose, the bridge is live.
    data.setRows(Array.from({ length: 3 }, (_, i) => ({ a: `y${i}` })) satisfies Row[])
    await tick()
    expect(redraws).toBeGreaterThan(0)

    const redrawsBeforeDispose = redraws
    engine.dispose()

    data.setRows(Array.from({ length: 4 }, (_, i) => ({ a: `z${i}` })) satisfies Row[])
    await tick()

    expect(redraws).toBe(redrawsBeforeDispose)
  })

  /**
   * Round-4 regression (`.superpowers/sdd/task-9-report.md` round-4 section): the test above
   * only exercises mutate → tick → dispose → mutate → tick — dispose() always runs with no
   * `scheduleDataRebuild` microtask in flight. It never catches the case where a microtask is
   * already queued (by an event that arrived BEFORE dispose()) and only executes AFTER
   * dispose(): on the count-mismatch branch that queued body calls `rebuildData()`, whose last
   * step is `subscribeToData()` — resurrecting the exact subscription `dispose()` just tore
   * down. This test uses the missing ordering: mutate (schedules the microtask) → dispose()
   * (BEFORE awaiting) → tick (the queued microtask now runs post-dispose) → mutate again
   * (proves the engine is genuinely unsubscribed, not just skipped once).
   */
  it('dispose() called while a deferred rebuild microtask is already queued prevents it from resurrecting the subscription', async () => {
    const data = makeData(10)
    const engine = new DefaultGridEngine({ data, theme: denseGridTheme })
    let redraws = 0
    engine.setDataChangeRedrawCallback(() => {
      redraws += 1
    })

    // Genuine count-mismatch (10 -> 6, no synchronous command handler reconciles it) —
    // schedules scheduleDataRebuild's queueMicrotask, but nothing has run yet.
    data.setRows(Array.from({ length: 6 }, (_, i) => ({ a: `p${i}` })) satisfies Row[])

    // dispose() BEFORE the already-queued microtask gets a chance to run.
    engine.dispose()

    await tick()
    // The deferred microtask ran (it was already queued), but disposed must have made it a
    // no-op: no redraw, and — critically — no rebuildData()/subscribeToData() resurrection.
    expect(redraws).toBe(0)

    // Prove the subscription is genuinely gone, not just skipped this one time: fire another
    // event on the same underlying data source after the tick.
    data.setRows(Array.from({ length: 4 }, (_, i) => ({ a: `q${i}` })) satisfies Row[])
    await tick()
    expect(redraws).toBe(0)
  })
})

describe('DefaultGridEngine — redraw/rebuild decoupling on a same-count reset', () => {
  /**
   * Reviewer's second (Important, non-blocking) finding for round 4: no test proved that a
   * same-count `reset` event (e.g. `WindowedDataSource.handleResyncEvent` invalidating its
   * cache without the row count actually changing) still fires the redraw callback while
   * correctly SKIPPING `rebuildData()` (see `scheduleDataRebuild`'s doc comment on why the
   * redraw callback is intentionally unconditional while the rebuild is gated on the count
   * comparison). Proxy for "rebuildData did not run": a custom row height survives — rebuildData
   * would have reset it to the theme default via `layout.initView()`'s from-scratch axis.
   */
  it('a reset with unchanged row count fires the redraw callback but leaves row structure untouched', async () => {
    const data = makeData(10)
    const engine = new DefaultGridEngine({ data, theme: denseGridTheme })
    engine.setRowHeight(0, 99)
    let redraws = 0
    engine.setDataChangeRedrawCallback(() => {
      redraws += 1
    })

    // setRows with the SAME row count (10 -> 10): emits rowCountChanged (newCount === current)
    // then reset, both coalesced into one scheduleDataRebuild microtask. rawData.getRowCount()
    // will equal rowStructure.getRawRowCount() when it runs, so the mismatch branch must be
    // skipped — but the redraw callback must still fire.
    data.setRows(Array.from({ length: 10 }, (_, i) => ({ a: `s${i}` })) satisfies Row[])
    await tick()

    expect(redraws).toBeGreaterThan(0)
    expect(engine.getRowHeight(0)).toBe(99)
  })
})
