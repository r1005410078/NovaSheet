// @ts-nocheck
import { Grid, WindowedDataSource } from '@zhiguang/novasheet-core'
import { canvas2dBackend } from '@zhiguang/novasheet-canvas2d'
import { FakeWindowedProvider } from '../fake-windowed-provider'

// 100 columns total (symbol + region + 98 metrics) so horizontal scroll also
// exercises column-axis block-diffing, not just the row axis.
const schema = {
  fields: [
    { id: 'symbol', name: 'Symbol', type: 'text', width: 110 },
    { id: 'region', name: 'Region', type: 'text', width: 90 },
    ...Array.from({ length: 98 }, (_, i) => ({ id: `t${i}`, name: `T+${i}`, type: 'number', width: 90 })),
  ],
}

// Provider is the only thing the app writes: loadRange fetches a rectangle,
// subscribe opens a push channel (WebSocket in production) for the visible window.
// Here the push side is simulated as a tick-by-tick feed: an 8-cell batch every 150ms.
// Anti-pattern: never poll with { type: 'resync' }; use cells (this demo) or invalidate.
// loadRange must only materialize the requested window (O(window)), not the full table.
const provider = new FakeWindowedProvider({
  schema,
  rowCount: 100_000,
  cellFn: (row, fieldId) => {
    if (fieldId === 'symbol') return `TICK${row}`
    if (fieldId === 'region') return ['NA', 'EU', 'APAC'][row % 3]
    const t = Number(fieldId.slice(1))
    return Math.round((100 + (row % 50) + t * 0.3 + Math.random() * 5) * 100) / 100
  },
  pushIntervalMs: 150,
  pushBatchSize: 8,
})

const data = new WindowedDataSource({
  schema,
  rowCount: 100_000,
  provider,
  preloadScreens: 2, // fetch ~2 screens beyond the visible window
})

const grid = new Grid(container, { backend: canvas2dBackend(), data })

// Grid calls hintWindow(visibleWindow) internally on every render frame (no-op if
// unchanged); WindowedDataSource expands it by preloadScreens, dedupes against
// cache, and fetches only what's missing.
