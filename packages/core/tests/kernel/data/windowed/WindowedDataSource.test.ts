import { describe, expect, it } from 'bun:test'
import { WindowedDataSource } from '../../../../src/kernel/data/windowed/WindowedDataSource'
import { createFakeWindowedProvider } from './fakeProvider'
import type { Schema } from '../../../../src/kernel/data/Schema'
import type { DataSourceEvent } from '../../../../src/kernel/data/DataSource'

const schema: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 100 },
    { id: 'score', name: 'Score', type: 'number', width: 80 },
  ],
}

async function tick(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => queueMicrotask(() => resolve(undefined)))
}

describe('WindowedDataSource — construction, sync reads, prefetch', () => {
  it('exposes rowCount/schema synchronously; miss before hintWindow', () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({ schema, rowCount: 100_000, provider: fake.provider })

    expect(source.getRowCount()).toBe(100_000)
    expect(source.getSchema()).toBe(schema)
    expect(source.getCell(0, 'name')).toBeUndefined()
    source.dispose()
  })

  it('hintWindow issues exactly one loadRange for the expanded+clamped window; resolve fills cache and emits rowsChanged once', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({
      schema,
      rowCount: 100_000,
      provider: fake.provider,
      preloadScreens: 2,
      // blockRows=30: preload-expanded window (rows 0..29, see below) must fit inside a single
      // block-row — §6.1 步骤 4 merges rects only within one blockRow, never across, so a smaller
      // blockRows here would split this into two loadRange calls instead of the one under test.
      blockRows: 30,
      blockCols: 2,
    })
    const events: DataSourceEvent[] = []
    source.subscribe((e) => events.push(e))

    source.hintWindow({ startRow: 0, endRow: 19, startCol: 0, endCol: 1 })
    expect(fake.pendingLoads()).toHaveLength(1)
    const [load] = fake.pendingLoads()
    expect(load!.window).toEqual({ startRow: 0, endRow: 29, startCol: 0, endCol: 1 })

    expect(source.getCell(0, 'name')).toBeUndefined()

    load!.resolve({ rows: Array.from({ length: 30 }, (_, i) => ({ name: `n${i}`, score: i })) })
    await tick()

    expect(source.getCell(0, 'name')).toBe('n0')
    expect(source.getCell(19, 'score')).toBe(19)
    expect(events).toEqual([{ type: 'rowsChanged', startIndex: 0, endIndex: 29 }])
    source.dispose()
  })

  it('repeated hintWindow calls with the same window are a no-op (no new loadRange)', () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({ schema, rowCount: 1000, provider: fake.provider })
    const window = { startRow: 0, endRow: 19, startCol: 0, endCol: 1 }

    source.hintWindow(window)
    expect(fake.pendingLoads()).toHaveLength(1)
    source.hintWindow({ ...window })
    expect(fake.pendingLoads()).toHaveLength(1) // still just the one request
    source.dispose()
  })

  it('scrolling within the preload window triggers zero additional requests; scrolling out aborts stale in-flight requests outside the new preload window', () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({
      schema,
      rowCount: 1000,
      provider: fake.provider,
      preloadScreens: 2,
      // blockRows=15: preload window (rows 0..14) must fit in a single block-row — see the
      // blockRows=30 note in the earlier test for why a smaller value would fan out into
      // multiple loadRange calls instead of the single one under test here.
      blockRows: 15,
      blockCols: 2,
    })

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 }) // preload → rows 0..14
    expect(fake.pendingLoads()).toHaveLength(1)
    const firstLoad = fake.pendingLoads()[0]!

    source.hintWindow({ startRow: 500, endRow: 509, startCol: 0, endCol: 1 }) // far away
    expect(firstLoad.signal.aborted).toBe(true)
    source.dispose()
  })

  it('applyEpoch: a loadRange response whose rowCount shrinks soft-invalidates — updates rowCount, emits rowCountChanged, marks other cached blocks stale, and reprioritizes their refetch', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({ schema, rowCount: 1000, provider: fake.provider, blockRows: 10, blockCols: 2 })
    const events: DataSourceEvent[] = []
    source.subscribe((e) => events.push(e))

    // block A resident and fresh
    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    const [blockALoad] = fake.pendingLoads()
    blockALoad!.resolve({ rows: Array.from({ length: 10 }, () => ({ name: 'a', score: 1 })), rowCount: 1000 })
    await tick()
    events.length = 0

    // scrolling to block B's revalidation response carries a shrunk rowCount (server deleted rows)
    source.hintWindow({ startRow: 100, endRow: 109, startCol: 0, endCol: 1 })
    const blockBLoad = fake.pendingLoads().find((l) => l.window.startRow >= 100)!
    blockBLoad.resolve({ rows: Array.from({ length: 10 }, () => ({ name: 'b', score: 1 })), rowCount: 800 })
    await tick()

    expect(source.getRowCount()).toBe(800)
    expect(events).toContainEqual({ type: 'rowCountChanged', newCount: 800 })
    expect(source.getCell(0, 'name')).toBe('a') // stale block A still readable, not cleared

    // reprioritized refetch: scrolling back to block A immediately re-requests it (marked stale)
    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    expect(fake.pendingLoads().some((l) => l.window.startRow <= 0 && l.window.endRow >= 9)).toBe(true)
    source.dispose()
  })

  it('applyEpoch: a lower-version response is dropped as stale, does not overwrite fresher cached data', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({
      schema,
      rowCount: 1000,
      provider: fake.provider,
      blockRows: 10,
      blockCols: 2,
      staleAfterMs: 5,
    })

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    const [firstLoad] = fake.pendingLoads()
    firstLoad!.resolve({ rows: Array.from({ length: 10 }, () => ({ name: 'fresh', score: 1 })), version: 5 })
    await tick()
    expect(source.getCell(0, 'name')).toBe('fresh')

    // scroll far enough away, long enough, to make the block stale and trigger a background refetch on return
    source.hintWindow({ startRow: 500, endRow: 509, startCol: 0, endCol: 1 })
    await new Promise((resolve) => setTimeout(resolve, 10))
    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    const staleReplay = fake.pendingLoads().find((l) => l.window.startRow <= 0 && l.window.endRow >= 9)!

    staleReplay.resolve({
      rows: Array.from({ length: 10 }, () => ({ name: 'stale-out-of-order', score: 0 })),
      version: 3, // arrives out of order, older than the already-applied version 5
    })
    await tick()

    expect(source.getCell(0, 'name')).toBe('fresh') // lower-version response discarded, not applied
    source.dispose()
  })

  it('applyEpoch: a higher version with unchanged rowCount still soft-invalidates without emitting rowCountChanged', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({
      schema,
      rowCount: 1000,
      provider: fake.provider,
      // blockRows=15: first window's preload (rows 0..14) must fit in a single block-row — see
      // the blockRows=30 note further up for why a smaller value fans out into multiple
      // loadRange calls, which would make `[firstLoad]` pick only one of two and leave the
      // other permanently dangling for the wrong reason.
      blockRows: 15,
      blockCols: 2,
      staleAfterMs: 100_000, // freshness clock alone would never explain a later refetch
    })
    const events: DataSourceEvent[] = []
    source.subscribe((e) => events.push(e))

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    const [firstLoad] = fake.pendingLoads()
    firstLoad!.resolve({ rows: Array.from({ length: 10 }, () => ({ name: 'v1', score: 1 })), version: 1, rowCount: 1000 })
    await tick()
    events.length = 0

    source.hintWindow({ startRow: 100, endRow: 109, startCol: 0, endCol: 1 })
    const [secondLoad] = fake.pendingLoads()
    secondLoad!.resolve({ rows: Array.from({ length: 10 }, () => ({ name: 'v2', score: 1 })), version: 2, rowCount: 1000 })
    await tick()

    expect(events.some((e) => e.type === 'rowCountChanged')).toBe(false) // rowCount unchanged — no event

    // block from version 1, still well within staleAfterMs, is nonetheless marked stale by the
    // version bump — scrolling back to it re-fetches instead of trusting the freshness clock alone
    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    expect(fake.pendingLoads().some((l) => l.window.startRow <= 0 && l.window.endRow >= 9)).toBe(true)
    source.dispose()
  })

  it('dispose aborts in-flight requests, closes the subscription, and ignores late resolutions', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({ schema, rowCount: 1000, provider: fake.provider })
    const events: DataSourceEvent[] = []
    source.subscribe((e) => events.push(e))

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    const [load] = fake.pendingLoads()

    source.dispose()
    expect(fake.closeCalls).toBe(1)
    expect(load!.signal.aborted).toBe(true)

    load!.resolve({ rows: Array.from({ length: 10 }, () => ({ name: 'x', score: 1 })) })
    await tick()
    expect(events).toEqual([])
    expect(source.getCell(0, 'name')).toBeUndefined()

    source.dispose() // idempotent, no throw
  })
})

describe('WindowedDataSource — push channel (rowCount/resync) and subscription follow', () => {
  it('rowCount event with a smaller value shrinks rowCount, emits rowCountChanged, marks cache stale, and re-plans the current window immediately', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({
      schema,
      rowCount: 1000,
      provider: fake.provider,
      // blockRows=15: initial hintWindow's preload (rows 0..14) must fit in a single block-row —
      // see the blockRows=30 note further up. A smaller value (e.g. 10) fans the first
      // planAndFetch out into two loadRange calls; resolving only [firstLoad] then leaves the
      // second permanently pending in the fake provider, which alone would make the
      // "re-plans immediately" assertion below true even if handleRowCountEvent never re-fetched.
      blockRows: 15,
      blockCols: 2,
    })
    const events: DataSourceEvent[] = []
    source.subscribe((e) => events.push(e))

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    const [firstLoad] = fake.pendingLoads()
    firstLoad!.resolve({
      rows: Array.from(
        { length: firstLoad!.window.endRow - firstLoad!.window.startRow + 1 },
        () => ({ name: 'x', score: 1 }),
      ),
    })
    await tick()
    events.length = 0

    fake.emit({ type: 'rowCount', rowCount: 800 })

    expect(source.getRowCount()).toBe(800)
    expect(events).toContainEqual({ type: 'rowCountChanged', newCount: 800 })
    // re-plan for the still-active hinted window fires a fresh loadRange for the now-stale block
    expect(fake.pendingLoads().length).toBeGreaterThan(0)
    source.dispose()
  })

  it('resync aborts in-flight requests, clears the cache, emits reset (and rowCountChanged if rowCount provided), and re-fetches the current window', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({
      schema,
      rowCount: 1000,
      provider: fake.provider,
      // blockRows=15: initial hintWindow's preload (rows 0..14) must fit in a single block-row —
      // see the blockRows=30 note further up. A smaller value (e.g. 10) fans the first
      // planAndFetch out into two loadRange calls; resolving only [firstLoad] then leaves the
      // second permanently pending in the fake provider, which alone would make the
      // "re-fetches the current window" assertion below true even if handleResyncEvent never
      // re-fetched.
      blockRows: 15,
      blockCols: 2,
    })
    const events: DataSourceEvent[] = []
    source.subscribe((e) => events.push(e))

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    const [firstLoad] = fake.pendingLoads()
    firstLoad!.resolve({ rows: Array.from({ length: firstLoad!.window.endRow - firstLoad!.window.startRow + 1 }, () => ({ name: 'x', score: 1 })) })
    await tick()
    expect(source.getCell(0, 'name')).toBe('x')
    events.length = 0

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 }) // ensure no pending unrelated request before resync
    const inFlightBeforeResync = fake.pendingLoads()

    fake.emit({ type: 'resync', rowCount: 500 })

    for (const load of inFlightBeforeResync) expect(load.signal.aborted).toBe(true)
    expect(source.getCell(0, 'name')).toBeUndefined() // cache cleared
    expect(source.getRowCount()).toBe(500)
    expect(events).toContainEqual({ type: 'rowCountChanged', newCount: 500 })
    expect(events).toContainEqual({ type: 'reset' })
    expect(fake.pendingLoads().length).toBeGreaterThan(0) // re-fetch issued for current window
    source.dispose()
  })

  it('setWindow is called once, with the visible (unexpanded) window, only after the debounce interval settles', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({
      schema,
      rowCount: 1000,
      provider: fake.provider,
      subscribeDebounceMs: 20,
    })

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    source.hintWindow({ startRow: 1, endRow: 10, startCol: 0, endCol: 1 })
    source.hintWindow({ startRow: 2, endRow: 11, startCol: 0, endCol: 1 })
    expect(fake.setWindowCalls).toHaveLength(0) // still within debounce window

    await new Promise((resolve) => setTimeout(resolve, 40))

    expect(fake.setWindowCalls).toEqual([{ startRow: 2, endRow: 11, startCol: 0, endCol: 1 }])
    source.dispose()
  })

  it('a block that goes stale (staleAfterMs elapsed) is refetched in the background when it re-enters the preload window, without clearing its old value first', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({
      schema,
      rowCount: 1000,
      provider: fake.provider,
      blockRows: 10,
      blockCols: 2,
      staleAfterMs: 10,
    })

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    const [firstLoad] = fake.pendingLoads()
    firstLoad!.resolve({ rows: Array.from({ length: 10 }, () => ({ name: 'old', score: 1 })) })
    await tick()
    expect(source.getCell(0, 'name')).toBe('old')

    source.hintWindow({ startRow: 500, endRow: 509, startCol: 0, endCol: 1 }) // scroll far away
    await new Promise((resolve) => setTimeout(resolve, 20)) // exceed staleAfterMs

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 }) // scroll back

    expect(source.getCell(0, 'name')).toBe('old') // stale value still readable, not cleared
    const refetch = fake.pendingLoads().find(
      (l) => l.window.startRow <= 0 && l.window.endRow >= 9 && l.window.startCol === 0,
    )
    expect(refetch).toBeDefined()

    refetch!.resolve({ rows: Array.from({ length: refetch!.window.endRow - refetch!.window.startRow + 1 }, () => ({ name: 'new', score: 2 })) })
    await tick()
    expect(source.getCell(0, 'name')).toBe('new')
    source.dispose()
  })
})
