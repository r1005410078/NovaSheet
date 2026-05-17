import type { Meta, StoryObj } from '@storybook/html'
import { Grid } from '@novasheet/web'
import { InMemoryDataSource, type Schema } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { GeneratedDataSource } from '../generated-data-source'
import { docsMeta, docsStory } from '../story-docs'
import tenThousandSrc from './snippets/scroll.tenThousand.snippet.ts?raw'
import oneMillionSrc from './snippets/scroll.oneMillion.snippet.ts?raw'
import scrollToRowSrc from './snippets/scroll.scrollToRow.snippet.ts?raw'
import bothAxisSrc from './snippets/scroll.bothAxis.snippet.ts?raw'
import scrollToCellSrc from './snippets/scroll.scrollToCell.snippet.ts?raw'

const schema: Schema = {
  fields: [
    { id: 'idx', name: 'Index', type: 'number', width: 80 },
    { id: 'name', name: 'Name', type: 'text', width: 200 },
    { id: 'category', name: 'Category', type: 'text', width: 160 },
    { id: 'value', name: 'Value', type: 'number', width: 120 },
  ],
}

const meta: Meta = {
  title: '表格/滚动',
  ...docsMeta('M2 原生滚动 + `ScrollMapper` 非线性 `scrollTop` 映射。'),
}
export default meta
type Story = StoryObj

export const TenThousandRows: Story = {
  name: '一万行',
  ...docsStory(tenThousandSrc),
  render: () => {
    const rows = Array.from({ length: 10_000 }, (_, i) => ({
      idx: i,
      name: `Item ${i}`,
      category: ['alpha', 'beta', 'gamma', 'delta'][i % 4]!,
      value: Math.round(Math.sin(i) * 10_000) / 100,
    }))
    const data = new InMemoryDataSource({ schema, rows })
    return createGridHost({ data })
  },
}

export const OneMillionRows: Story = {
  name: '一百万行 × 30 列',
  ...docsStory(oneMillionSrc, '`GeneratedDataSource` 按需生成，挂载无预分配。'),
  render: () => {
    const colCount = 30
    const wideSchema: Schema = {
      fields: Array.from({ length: colCount }, (_, c) => ({
        id: `c${c}`,
        name: `Column ${c}`,
        type: c % 3 === 0 ? ('number' as const) : ('text' as const),
        width: 140,
      })),
    }
    const data = new GeneratedDataSource(1_000_000, wideSchema, (r, fieldId) => {
      const c = Number(fieldId.slice(1))
      return c % 3 === 0 ? r * 100 + c : `r${r}-c${c}`
    })
    return createGridHost({ data })
  },
}

export const ScrollToRow500: Story = {
  name: '滚动到第 500 行',
  ...docsStory(scrollToRowSrc),
  render: () => {
    const rows = Array.from({ length: 2_000 }, (_, i) => ({
      idx: i,
      name: `Row ${i}`,
      category: ['alpha', 'beta', 'gamma'][i % 3]!,
      value: i,
    }))
    const data = new InMemoryDataSource({ schema, rows })
    const host = createGridHost({ data })
    requestAnimationFrame(() => {
      const grid = (host as HTMLElement & { __grid: Grid }).__grid
      grid.scrollToRow(500, 'center')
    })
    return host
  },
}

export const BothAxisScroll: Story = {
  name: '双向滚动（30 列）',
  ...docsStory(bothAxisSrc),
  render: () => {
    const colCount = 30
    const wideSchema: Schema = {
      fields: Array.from({ length: colCount }, (_, c) => ({
        id: `c${c}`,
        name: `Column ${c}`,
        type: c % 3 === 0 ? ('number' as const) : ('text' as const),
        width: 140,
      })),
    }
    const rows = Array.from({ length: 500 }, (_, r) => {
      const row: Record<string, string | number> = {}
      for (let c = 0; c < colCount; c++) {
        row[`c${c}`] = c % 3 === 0 ? r * 100 + c : `r${r}-c${c}`
      }
      return row
    })
    const data = new InMemoryDataSource({ schema: wideSchema, rows })
    return createGridHost({ data })
  },
}

export const ScrollToCellFar: Story = {
  name: '滚动到远列',
  ...docsStory(scrollToCellSrc),
  render: () => {
    const colCount = 30
    const wideSchema: Schema = {
      fields: Array.from({ length: colCount }, (_, c) => ({
        id: `c${c}`,
        name: `Column ${c}`,
        type: 'text' as const,
        width: 140,
      })),
    }
    const rows = Array.from({ length: 500 }, (_, r) => {
      const row: Record<string, string> = {}
      for (let c = 0; c < colCount; c++) row[`c${c}`] = `r${r}-c${c}`
      return row
    })
    const data = new InMemoryDataSource({ schema: wideSchema, rows })
    const host = createGridHost({ data })
    requestAnimationFrame(() => {
      const grid = (host as HTMLElement & { __grid: Grid }).__grid
      grid.scrollToCell(100, 'c20')
    })
    return host
  },
}
