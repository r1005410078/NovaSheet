import { describe, expect, it } from 'bun:test'
import { WindowedDataSource } from '../../../../src/kernel/data/windowed/WindowedDataSource'
import { createFakeWindowedProvider } from '../../../kernel/data/windowed/fakeProvider'
import type { Schema } from '../../../../src/kernel/data/Schema'
import type { DataSourceEvent } from '../../../../src/kernel/data/DataSource'

const schema: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 100 },
    { id: 'score', name: 'Score', type: 'number', width: 80 },
  ],
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => queueMicrotask(() => resolve(undefined)))
}

function rowsFor(win: { startRow: number; endRow: number }, label: string): { name: string; score: number }[] {
  const count = win.endRow - win.startRow + 1
  return Array.from({ length: count }, (_, i) => ({ name: `${label}${win.startRow + i}`, score: win.startRow + i }))
}

describe('Core acceptance windowed data source', () => {
  it('core.L0.datasource-windowed-initial-skeleton exposes full skeleton immediately, fills on first load', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({
      schema,
      rowCount: 100_000,
      provider: fake.provider,
      // blockRows=60 exactly matches the preloadScreens=2 symmetric expansion of the 40-row
      // visible window below (0..39 -> margin 20 each side -> 0..59), so the request's
      // block-aligned window equals the theoretical expand+clamp result instead of a much
      // larger block that would obscure what the "symmetric expand, clamp" Then-clause claims.
      blockRows: 60,
      blockCols: 2,
    })
    const events: DataSourceEvent[] = []
    source.subscribe((e) => events.push(e))

    expect(source.getRowCount()).toBe(100_000)
    expect(source.getSchema()).toBe(schema)
    expect(source.getCell(0, 'name')).toBeUndefined()

    source.hintWindow({ startRow: 0, endRow: 39, startCol: 0, endCol: 1 })
    expect(fake.pendingLoads()).toHaveLength(1) // exactly one loadRange call
    const [load] = fake.pendingLoads()
    expect(load!.window).toEqual({ startRow: 0, endRow: 59, startCol: 0, endCol: 1 }) // symmetric preload expansion, clamped to data bounds
    load!.resolve({ rows: rowsFor(load!.window, 'r') })
    await flush()

    expect(source.getCell(0, 'name')).toBe('r0')
    expect(events).toContainEqual(expect.objectContaining({ type: 'rowsChanged' }))
    source.dispose()
  })

  it('core.L0.datasource-windowed-scroll-prefetch: zero requests inside the preload window, block-aligned request when scrolling out, abort when the block exits again', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({
      schema,
      rowCount: 100_000,
      provider: fake.provider,
      preloadScreens: 2,
      blockRows: 128,
      blockCols: 16,
    })

    source.hintWindow({ startRow: 0, endRow: 19, startCol: 0, endCol: 1 })
    const [firstLoad] = fake.pendingLoads()
    firstLoad!.resolve({ rows: rowsFor(firstLoad!.window, 'r') })
    await flush()

    source.hintWindow({ startRow: 5, endRow: 24, startCol: 0, endCol: 1 }) // still inside the resident preload block
    source.hintWindow({ startRow: 10, endRow: 29, startCol: 0, endCol: 1 }) // still inside
    expect(fake.pendingLoads()).toHaveLength(0)

    source.hintWindow({ startRow: 200, endRow: 219, startCol: 0, endCol: 1 }) // scroll far away -> new block
    expect(fake.pendingLoads()).toHaveLength(1)
    const [farLoad] = fake.pendingLoads()
    expect(farLoad!.window).toEqual({ startRow: 128, endRow: 255, startCol: 0, endCol: 1 }) // block-aligned, not the raw preload margin

    source.hintWindow({ startRow: 700, endRow: 719, startCol: 0, endCol: 1 }) // scroll away again -- the just-issued block now exits the preload region
    expect(farLoad!.signal.aborted).toBe(true)
    source.dispose()
  })

  it('core.L0.datasource-windowed-push-update: resident block updates instantly, in-flight buffers, unloaded block drops', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({
      schema,
      rowCount: 1000,
      provider: fake.provider,
      // blockRows=30: both hintWindow calls below (0..9 and 100..109) must each preload-expand
      // (default preloadScreens=2, margin=floor(rowSpan/2)=5) into a range fully inside ONE
      // block-row (blocks 0..29 and 90..119 respectively) -- a smaller blockRows would fan either
      // call out into two loadRange calls, and destructuring/finding only one would leave the
      // other permanently pending in the fake provider.
      blockRows: 30,
      blockCols: 2,
    })
    const events: DataSourceEvent[] = []
    source.subscribe((e) => events.push(e))

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 }) // block A
    expect(fake.pendingLoads()).toHaveLength(1)
    const [blockALoad] = fake.pendingLoads()
    blockALoad!.resolve({ rows: rowsFor(blockALoad!.window, 'a') })
    await flush()
    events.length = 0 // isolate assertions below to the push event's effects

    source.hintWindow({ startRow: 100, endRow: 109, startCol: 0, endCol: 1 }) // block B, still in-flight
    expect(fake.pendingLoads()).toHaveLength(1)
    const [blockBLoad] = fake.pendingLoads()

    fake.emit({
      type: 'cells',
      updates: [
        { row: 0, fieldId: 'name', value: 'pushed-a' }, // resident
        { row: 100, fieldId: 'name', value: 'pushed-b' }, // in-flight
        { row: 500, fieldId: 'name', value: 'pushed-c' }, // never loaded
      ],
    })
    await flush()

    expect(source.getCell(0, 'name')).toBe('pushed-a')
    expect(events).toEqual([{ type: 'rowsChanged', startIndex: 0, endIndex: 0 }]) // only the resident block's change is observable
    expect(source.getCell(100, 'name')).toBeUndefined() // block B not landed yet
    expect(source.getCell(500, 'name')).toBeUndefined() // never loaded, safely dropped

    blockBLoad!.resolve({ rows: rowsFor(blockBLoad!.window, 'b') }) // stale snapshot value for row 100
    await flush()
    expect(source.getCell(100, 'name')).toBe('pushed-b') // pending buffer replay wins over stale fetch value
    source.dispose()
  })

  it('core.L0.datasource-windowed-subscription-follow: setWindow fires once with the last window after the debounce settles', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({ schema, rowCount: 1000, provider: fake.provider, subscribeDebounceMs: 15 })

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    source.hintWindow({ startRow: 1, endRow: 10, startCol: 0, endCol: 1 })
    expect(fake.setWindowCalls).toHaveLength(0)

    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(fake.setWindowCalls).toEqual([{ startRow: 1, endRow: 10, startCol: 0, endCol: 1 }])
    source.dispose()
  })

  it('core.L0.datasource-windowed-stale-revalidate: stale block re-entering the window is readable immediately and refetched in the background', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({
      schema,
      rowCount: 1000,
      provider: fake.provider,
      // blockRows=100: window {0,9}'s preload expansion (0..14) must stay inside a single
      // block-row. The "away" window is 550..559 rather than the more obvious 500..509 because
      // 500 sits exactly on this blockRows' boundary (495..514 would straddle blocks 4 and 5);
      // 550..559 expands to 545..564, fully inside block 5 (rows 500..599).
      blockRows: 100,
      blockCols: 2,
      staleAfterMs: 10,
    })

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    expect(fake.pendingLoads()).toHaveLength(1)
    const [load] = fake.pendingLoads()
    load!.resolve({ rows: rowsFor(load!.window, 'old') })
    await flush()

    source.hintWindow({ startRow: 550, endRow: 559, startCol: 0, endCol: 1 })
    await new Promise((resolve) => setTimeout(resolve, 20)) // exceed staleAfterMs
    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })

    expect(source.getCell(0, 'name')).toBe('old0') // still readable, not cleared
    // .find (not a bare length/first-element check): the "away" request above is aborted by this
    // replan but never resolved/rejected by the fake, so it still sits in pendingLoads() -- only a
    // window-precise match proves a genuine new refetch for block A landed, not the stale leak.
    const refetch = fake.pendingLoads().find((l) => l.window.startRow <= 0 && l.window.endRow >= 9)!
    expect(refetch).toBeDefined()
    refetch.resolve({ rows: rowsFor(refetch.window, 'new') })
    await flush()
    expect(source.getCell(0, 'name')).toBe('new0')
    source.dispose()
  })

  it('core.L0.datasource-windowed-epoch-shrink: a loadRange response carrying a shrunk rowCount soft-invalidates the cache', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({ schema, rowCount: 1000, provider: fake.provider, blockRows: 30, blockCols: 2 })
    const events: DataSourceEvent[] = []
    source.subscribe((e) => events.push(e))

    // block A: resident and fresh, well within data bounds even after the shrink below
    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    const [blockALoad] = fake.pendingLoads()
    blockALoad!.resolve({ rows: rowsFor(blockALoad!.window, 'a'), rowCount: 1000 })
    await flush()
    events.length = 0

    // scroll to an adjacent block: block A (already fresh) is skipped and stays resident inside
    // this same preload window, while block B (rows 30..59) is the one newly fetched
    source.hintWindow({ startRow: 20, endRow: 39, startCol: 0, endCol: 1 })
    expect(fake.pendingLoads()).toHaveLength(1)
    const [blockBLoad] = fake.pendingLoads()
    blockBLoad!.resolve({ rows: rowsFor(blockBLoad!.window, 'b'), rowCount: 800 })
    await flush()

    expect(source.getRowCount()).toBe(800)
    expect(events).toContainEqual({ type: 'rowCountChanged', newCount: 800 })
    expect(source.getCell(0, 'name')).toBe('a0') // block A's stale value still readable, not cleared

    // block A sits inside the CURRENT preload window (rows 10..49) -- its reprioritized refetch
    // fires immediately as part of landing block B's response, with no further hintWindow call
    const reprioritized = fake.pendingLoads().find((l) => l.window.startRow <= 0 && l.window.endRow >= 9)
    expect(reprioritized).toBeDefined()
    source.dispose()
  })

  it('core.L0.datasource-windowed-resync: resets cache, aborts in-flight, emits reset, and re-fetches the current window', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({ schema, rowCount: 1000, provider: fake.provider, blockRows: 30, blockCols: 2 })
    const events: DataSourceEvent[] = []
    source.subscribe((e) => events.push(e))

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    const [firstLoad] = fake.pendingLoads()
    firstLoad!.resolve({ rows: rowsFor(firstLoad!.window, 'r') })
    await flush()
    expect(source.getCell(0, 'name')).toBe('r0')

    // a genuinely different window (not 500..509, which straddles this blockRows' boundary --
    // see the stale-revalidate test above) leaves a fresh, still-unresolved request to abort
    source.hintWindow({ startRow: 250, endRow: 259, startCol: 0, endCol: 1 })
    const inFlightBeforeResync = fake.pendingLoads()
    expect(inFlightBeforeResync.length).toBeGreaterThan(0)

    fake.emit({ type: 'resync', rowCount: 500 })

    for (const load of inFlightBeforeResync) expect(load.signal.aborted).toBe(true)
    expect(source.getCell(0, 'name')).toBeUndefined() // cache cleared
    expect(source.getRowCount()).toBe(500)
    expect(events).toContainEqual({ type: 'rowCountChanged', newCount: 500 })
    expect(events).toContainEqual({ type: 'reset' })
    // Identity-compare rather than bare length>0: the fake provider never removes an entry from
    // pendingLoads() on abort() (only on resolve()/reject()), so the aborted-but-never-settled
    // request above would still be sitting there and could satisfy a naive length/some(window)
    // check even if the resync handler's re-fetch never ran.
    const afterResync = fake.pendingLoads()
    expect(afterResync.some((load) => !inFlightBeforeResync.includes(load))).toBe(true)
    source.dispose()
  })

  it('core.L0.datasource-windowed-dispose: closes subscription, aborts in-flight, ignores late arrivals, idempotent', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({ schema, rowCount: 1000, provider: fake.provider })
    const events: DataSourceEvent[] = []
    source.subscribe((e) => events.push(e))

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    const [load] = fake.pendingLoads()

    source.dispose()
    expect(fake.closeCalls).toBe(1)
    expect(load!.signal.aborted).toBe(true)

    load!.resolve({ rows: rowsFor(load!.window, 'late') })
    await flush()
    expect(events).toEqual([])
    expect(source.getCell(0, 'name')).toBeUndefined()

    source.hintWindow({ startRow: 50, endRow: 59, startCol: 0, endCol: 1 }) // dispose already happened -- must be inert
    expect(fake.pendingLoads()).toHaveLength(0) // no new loadRange after dispose

    expect(() => source.dispose()).not.toThrow()
  })
})
