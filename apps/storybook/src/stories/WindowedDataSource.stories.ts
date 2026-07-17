import type { Meta, StoryObj } from '@storybook/html'
import { WindowedDataSource } from '@zhiguang/core'
import type { Schema } from '@zhiguang/core'
import { createGridHost } from '../grid-host'
import { FakeWindowedProvider } from '../fake-windowed-provider'
import { docsMeta, docsStory } from '../story-docs'
import basicSrc from './snippets/windowed-data-source.basic.snippet.ts?raw'

const ROW_COUNT = 100_000
const METRIC_COL_COUNT = 98 // + symbol + region = 100 columns total; exercises column-axis block-diffing

const schema: Schema = {
  fields: [
    { id: 'symbol', name: 'Symbol', type: 'text', width: 110 },
    { id: 'region', name: 'Region', type: 'text', width: 90 },
    ...Array.from({ length: METRIC_COL_COUNT }, (_, i) => ({
      id: `t${i}`,
      name: `T+${i}`,
      type: 'number' as const,
      width: 90,
    })),
  ],
}

function cellFn(row: number, fieldId: string): string | number {
  if (fieldId === 'symbol') return `TICK${row}`
  if (fieldId === 'region') return ['NA', 'EU', 'APAC'][row % 3]!
  const t = Number(fieldId.slice(1))
  const base = 100 + (row % 50) + t * 0.3
  return Math.round((base + Math.random() * 5) * 100) / 100
}

const meta: Meta = {
  title: 'Table/Windowed data source',
  parameters: { layout: 'centered' },
  ...docsMeta(
    '`WindowedDataSource` fetches remote data for the visible region plus an overscan margin ' +
      '(`preloadScreens`) so scrolling ahead rarely blocks on network, and subscribes for ' +
      'WebSocket-style push updates on the settled visible window — here simulated as a ' +
      'tick-by-tick market-data feed (a batch of cell updates every 150ms). ' +
      'Anti-pattern: do NOT poll with `{ type: \"resync\" }` (hard cache clear); use `cells` ' +
      'for live/poll updates, `invalidate` for soft snapshot refresh, and `resync` only on reconnect. ' +
      '`loadRange` must be O(window), never build the full table then slice. ' +
      'Prefer `createSnapshotWindowedProvider` for snapshot polling. ' +
      'The activity log below shows `loadRange` (fetch), `tick` (push batch) and `subscribe window` ' +
      '(debounced follow) events from the transport-agnostic `WindowedDataProvider` port as you scroll.',
  ),
}
export default meta
type Story = StoryObj

export const Basic: Story = {
  name: 'Overscan prefetch + live push',
  ...docsStory(
    basicSrc,
    'Scroll the grid: the log shows `loadRange` requests fetching ahead of the visible ' +
      'area (2 screens via `preloadScreens: 2`), and `tick` lines showing an 8-cell push ' +
      'batch landing on whatever is currently cached every 150ms — a simulated tick-by-tick ' +
      'market-data feed rather than one-off pushes.',
  ),
  render: () => {
    const wrapper = document.createElement('div')
    Object.assign(wrapper.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      padding: '8px',
      width: '780px',
      height: '520px',
      boxSizing: 'border-box',
    })

    const logEl = document.createElement('pre')
    Object.assign(logEl.style, {
      margin: '0',
      height: '110px',
      overflowY: 'auto',
      fontSize: '11px',
      lineHeight: '1.4',
      background: '#111',
      color: '#0f0',
      padding: '6px 8px',
      borderRadius: '4px',
      boxSizing: 'border-box',
    })

    const logLines: string[] = []
    function logActivity(message: string): void {
      const stamp = new Date().toISOString().slice(11, 19)
      logLines.push(`${stamp}  ${message}`)
      if (logLines.length > 40) logLines.shift()
      logEl.textContent = logLines.join('\n')
      logEl.scrollTop = logEl.scrollHeight
    }

    const provider = new FakeWindowedProvider({
      schema,
      rowCount: ROW_COUNT,
      cellFn,
      onActivity: logActivity,
      pushIntervalMs: 150, // tick-by-tick: a push batch roughly every 150ms
      pushBatchSize: 8,
    })

    const data = new WindowedDataSource({
      schema,
      rowCount: ROW_COUNT,
      provider,
      preloadScreens: 2,
    })

    const gridContainer = document.createElement('div')
    Object.assign(gridContainer.style, { flex: '1', minHeight: '0', position: 'relative' })
    const gridEl = createGridHost({ data }, '100%', '100%')
    gridContainer.appendChild(gridEl)

    wrapper.appendChild(logEl)
    wrapper.appendChild(gridContainer)
    return wrapper
  },
}
