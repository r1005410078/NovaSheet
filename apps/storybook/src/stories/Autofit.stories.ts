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

const WRAP_DEMO_HOST = { width: 720, height: 420 } as const
const BIG_DATA_HOST = { width: 860, height: 520 } as const

const meta: Meta = {
  title: '表格/行高自适应',
  parameters: { layout: 'centered' },
  ...docsMeta(
    'M3 autofit：`field.wrap = true` 时支持多行换行；`grid.autofitRows()` 按当前列宽与文本内容批量重算行高。',
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
 * 长文本 + autofit：mount 后调用 `grid.autofitRows()` 自动按内容把每行撑开。
 * 含长/短/中英/符号/空备注等多类样本。
 */
export const LongTextAutofit: Story = {
  name: '长文本 + autofitRows()',
  ...docsStory(autofitLongTextSrc, '10 行多样本；加载后自动 `autofitRows()` 撑开行高。'),
  render: () => {
    const data = new InMemoryDataSource({ schema, rows: sampleRows })
    const host = createGridHost({ data }, WRAP_DEMO_HOST.width, WRAP_DEMO_HOST.height)
    mountAutofit(host)
    return host
  },
}

/**
 * wrap=true 但 **不调** autofitRows：行高仍是默认值，长文本只展示首行（被单元格底部裁掉）。
 */
export const WrapWithoutAutofit: Story = {
  name: '只换行不 autofit（对比）',
  ...docsStory(
    autofitLongTextDisabledSrc,
    'CellPainter 仍按 wrap 模式绘制，但行高保持默认；长文本会被单元格底部裁切。',
  ),
  render: () => {
    const data = new InMemoryDataSource({ schema, rows: sampleRows })
    return createGridHost({ data }, WRAP_DEMO_HOST.width, WRAP_DEMO_HOST.height)
  },
}

/**
 * 调用 autofitRows 后修改列宽——新 wrap 形态下，旧行高不再合适。
 */
export const AfterColumnResize: Story = {
  name: '列宽变化后再次 autofit',
  ...docsStory(
    autofitAfterColumnResizeSrc,
    'mount 后两次 autofitRows；第二次在拖窄 desc 列之后执行。',
  ),
  render: () => {
    const data = new InMemoryDataSource({ schema, rows: sampleRows })
    const host = createGridHost({ data }, WRAP_DEMO_HOST.width, WRAP_DEMO_HOST.height)
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

/** 分批 autofit，避免 1W 行一次性量度长时间阻塞首帧。 */
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

/** 1 万行 × 10 列：wrap + 全表 autofit 后纵向滚动。 */
export const TenThousandWrapScroll: Story = {
  name: '一万行 × 十列（换行 + 滚动）',
  ...docsStory(
    autofitTenThousandSrc,
    '描述/备注 `wrap: true`；挂载后分批 `autofitRows()` 按内容撑开行高，再滚到第 5000 行。',
  ),
  render: () => {
    const data = createWrapAutofitBigDataSource(BIG_DATA_ROW_COUNT)
    const host = createGridHost({ data }, BIG_DATA_HOST.width, BIG_DATA_HOST.height)
    mountBigDataAutofit(host, BIG_DATA_ROW_COUNT, () => {
      const grid = (host as HTMLElement & { __grid: Grid }).__grid
      grid.scrollToRow(5000, 'center')
    })
    return host
  },
}
