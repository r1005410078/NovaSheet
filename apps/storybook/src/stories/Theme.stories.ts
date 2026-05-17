import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource, denseGridTheme, type Theme } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'
import themeDenseSrc from './snippets/theme.dense.snippet.ts?raw'
import themeCompactSrc from './snippets/theme.compact.snippet.ts?raw'

const meta: Meta = {
  title: '表格/主题',
  ...docsMeta('通过 `theme` 选项或 `setTheme` 切换 Theme Token。'),
}
export default meta

type Story = StoryObj

export const Dense: Story = {
  name: '默认紧凑',
  ...docsStory(themeDenseSrc),
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 80) })
    return createGridHost({ data })
  },
}

const compactTheme: Theme = {
  ...denseGridTheme,
  metrics: {
    ...denseGridTheme.metrics,
    rowHeight: 24,
    headerHeight: 28,
    fontSize: 11,
  },
  colors: {
    ...denseGridTheme.colors,
    background: '#fbfbfd',
    headerBackground: '#ecf0f4',
    text: '#0d1117',
    headerText: '#4a5562',
    gridLine: '#e3e7eb',
    gridLineStrong: '#b8c2cc',
  },
}

export const Compact: Story = {
  name: '更紧凑',
  ...docsStory(themeCompactSrc),
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 80) })
    return createGridHost({ data, theme: compactTheme })
  },
}
