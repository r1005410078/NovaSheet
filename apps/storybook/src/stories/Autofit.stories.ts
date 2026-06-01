import type { Meta, StoryObj } from '@storybook/html'
import type { Grid } from '@novasheet/web'
import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import {
  createWrapAutofitBigDataSource,
  wrapAutofitSampleRows,
  wrapAutofitSchema,
} from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'
import autofitLongTextSrc from './snippets/autofit.longText.snippet.ts?raw'
import autofitLongTextDisabledSrc from './snippets/autofit.longText.disabled.snippet.ts?raw'
import autofitAfterColumnResizeSrc from './snippets/autofit.afterColumnResize.snippet.ts?raw'
import autofitTenThousandSrc from './snippets/autofit.tenThousand.snippet.ts?raw'

const schema = wrapAutofitSchema()
const sampleRows = wrapAutofitSampleRows()

const meta: Meta = {
  title: 'Table/Row height autofit',
  ...docsMeta(
    'M3 autofit: when `field.wrap = true`, cells can wrap across multiple lines. `grid.autofitRows()` recalculates row heights from current column widths and text content.',
  ),
}
export default meta

type Story = StoryObj

function mountAutofit(host: HTMLElement): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const grid = (host as HTMLElement & { __grid: Grid }).__grid
      grid.autofitRows()
    })
  })
}

/**
 * Long text + autofit: call `grid.autofitRows()` after mount to expand each row by content.
 * Includes long, short, bilingual, symbol-heavy, and empty-note samples.
 */
export const LongTextAutofit: Story = {
  name: 'Long text + autofitRows()',
  ...docsStory(
    autofitLongTextSrc,
    '10 diverse sample rows. `autofitRows()` runs on load to expand row heights.',
  ),
  render: () => {
    const data = new InMemoryDataSource({ schema, rows: sampleRows })
    const host = createGridHost({ data })
    mountAutofit(host)
    return host
  },
}

/**
 * wrap=true without calling autofitRows: row heights stay at defaults, so long text shows only the first clipped lines.
 */
export const WrapWithoutAutofit: Story = {
  name: 'Wrap without autofit (comparison)',
  ...docsStory(
    autofitLongTextDisabledSrc,
    'CellPainter still paints in wrap mode, but row heights stay at defaults, so long text is clipped by the cell bottom.',
  ),
  render: () => {
    const data = new InMemoryDataSource({ schema, rows: sampleRows })
    return createGridHost({ data })
  },
}

/**
 * Change column width after calling autofitRows; the old row heights no longer match the new wrapping shape.
 */
export const AfterColumnResize: Story = {
  name: 'Autofit after column resize',
  ...docsStory(
    autofitAfterColumnResizeSrc,
    '`autofitRows()` runs twice after mount; the second run happens after narrowing the desc column.',
  ),
  render: () => {
    const data = new InMemoryDataSource({ schema, rows: sampleRows })
    const host = createGridHost({ data })
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const grid = (host as HTMLElement & { __grid: Grid }).__grid
        grid.autofitRows()
        setTimeout(() => {
          grid.setColumnWidth('desc', 100)
          grid.autofitRows()
        }, 500)
      })
    })
    return host
  },
}

const BIG_DATA_ROW_COUNT = 10_000

/** Batched autofit avoids blocking the first frame by measuring all 10k rows at once. */
function mountBigDataAutofit(host: HTMLElement, rowCount: number, onDone: () => void): void {
  const batchSize = 500
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const grid = (host as HTMLElement & { __grid: Grid }).__grid
      let start = 0
      const runBatch = () => {
        const end = Math.min(start + batchSize, rowCount)
        const rows = Array.from({ length: end - start }, (_, i) => start + i)
        grid.autofitRows({ rows })
        start = end
        if (start < rowCount) requestAnimationFrame(runBatch)
        else onDone()
      }
      runBatch()
    })
  })
}

/** 10k rows x 10 columns: wrap + full-table autofit, then vertical scrolling. */
export const TenThousandWrapScroll: Story = {
  name: '10,000 rows x 10 columns (wrap + scroll)',
  ...docsStory(
    autofitTenThousandSrc,
    'Description and notes columns use `wrap: true`. After mount, batched `autofitRows()` expands row heights by content, then scrolls to row 5000.',
  ),
  render: () => {
    const data = createWrapAutofitBigDataSource(BIG_DATA_ROW_COUNT)
    const host = createGridHost({ data })
    mountBigDataAutofit(host, BIG_DATA_ROW_COUNT, () => {
      const grid = (host as HTMLElement & { __grid: Grid }).__grid
      grid.scrollToRow(5000, 'center')
    })
    return host
  },
}
